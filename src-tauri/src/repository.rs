use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const DATABASE_FILE: &str = "ilara.db";
const MAX_BACKUP_BYTES: usize = 5 * 1024 * 1024;
const DATA_VERSION: i64 = 4;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct AppSnapshot {
    version: u32,
    active_month: String,
    active_view: String,
    settings: Settings,
    people: Vec<Person>,
    transactions: Vec<FinanceTransaction>,
    occurrence_status: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct Settings {
    currency: String,
    locale: String,
    opening_balance_cents: i64,
    projection_months: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
struct Person {
    id: String,
    name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct FinanceTransaction {
    id: String,
    kind: String,
    name: String,
    category: String,
    person: String,
    amount_cents: i64,
    schedule: Schedule,
    due_day: i64,
    note: String,
    created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct Schedule {
    #[serde(rename = "type")]
    schedule_type: String,
    start_month: String,
    end_month: String,
    installments: i64,
}

fn timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .to_string()
}

fn is_valid_month(value: &str) -> bool {
    if value.len() != 7 || value.as_bytes().get(4) != Some(&b'-') {
        return false;
    }
    let year = &value[..4];
    let month = &value[5..];
    year.bytes().all(|byte| byte.is_ascii_digit())
        && matches!(
            month,
            "01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11" | "12"
        )
}

fn validate_snapshot(snapshot: &AppSnapshot) -> Result<(), String> {
    if snapshot.version != 3 {
        return Err("La versión del estado no es compatible.".into());
    }
    if !is_valid_month(&snapshot.active_month) {
        return Err("El mes activo no es válido.".into());
    }
    if !matches!(
        snapshot.active_view.as_str(),
        "dashboard" | "movements" | "projection" | "settings"
    ) {
        return Err("La vista activa no es válida.".into());
    }
    if snapshot.settings.currency != "ARS" || snapshot.settings.locale != "es-AR" {
        return Err("La configuración regional no es válida.".into());
    }
    if !matches!(snapshot.settings.projection_months, 6 | 12 | 18 | 24) {
        return Err("La cantidad de meses de proyección no es válida.".into());
    }

    let mut person_ids = HashSet::new();
    let mut person_names = HashSet::new();
    for person in &snapshot.people {
        let normalized_name = person.name.trim().to_lowercase();
        if person.id.trim().is_empty()
            || normalized_name.is_empty()
            || !person_ids.insert(person.id.as_str())
            || !person_names.insert(normalized_name)
        {
            return Err("La lista de personas contiene valores inválidos o duplicados.".into());
        }
    }

    let mut transaction_ids = HashSet::new();
    for transaction in &snapshot.transactions {
        if transaction.id.trim().is_empty() || !transaction_ids.insert(transaction.id.as_str()) {
            return Err("Hay movimientos con identificadores inválidos o duplicados.".into());
        }
        if !matches!(transaction.kind.as_str(), "income" | "expense")
            || transaction.name.trim().is_empty()
            || transaction.category.trim().is_empty()
            || transaction.person.trim().is_empty()
            || transaction.amount_cents <= 0
            || !matches!(
                transaction.schedule.schedule_type.as_str(),
                "one-time" | "monthly" | "installment"
            )
            || !is_valid_month(&transaction.schedule.start_month)
            || !(0..=31).contains(&transaction.due_day)
            || !(1..=120).contains(&transaction.schedule.installments)
        {
            return Err("Hay un movimiento con datos inválidos.".into());
        }
        if !transaction.schedule.end_month.is_empty()
            && !is_valid_month(&transaction.schedule.end_month)
        {
            return Err("Hay un movimiento con mes final inválido.".into());
        }
        if transaction.schedule.schedule_type == "monthly"
            && !transaction.schedule.end_month.is_empty()
            && transaction.schedule.end_month < transaction.schedule.start_month
        {
            return Err("Hay un movimiento cuyo mes final es anterior al inicial.".into());
        }
        if transaction.schedule.schedule_type == "installment"
            && transaction.schedule.installments < 2
        {
            return Err("Los movimientos en cuotas deben tener al menos dos cuotas.".into());
        }
    }

    for (key, status) in &snapshot.occurrence_status {
        let Some((transaction_id, month_key)) = key.rsplit_once(':') else {
            return Err("Hay un estado mensual con formato inválido.".into());
        };
        if status != "paid"
            || !transaction_ids.contains(transaction_id)
            || !is_valid_month(month_key)
        {
            return Err("Hay un estado mensual inválido o huérfano.".into());
        }
    }
    Ok(())
}

fn initialize_schema(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(include_str!(
            "../migrations/0001_create_initial_state_store.sql"
        ))
        .map_err(|error| error.to_string())?;
    connection
        .execute_batch(include_str!(
            "../migrations/0002_create_normalized_finance_store.sql"
        ))
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn open_database(app: &AppHandle) -> Result<Connection, String> {
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let connection =
        Connection::open(directory.join(DATABASE_FILE)).map_err(|error| error.to_string())?;
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(|error| error.to_string())?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| error.to_string())?;
    initialize_schema(&connection)?;
    Ok(connection)
}

fn load_normalized_state(connection: &Connection) -> Result<Option<AppSnapshot>, String> {
    let settings = connection
        .query_row(
            "SELECT active_month, active_view, currency, locale, opening_balance_cents, projection_months
             FROM app_settings WHERE id = 1",
            [],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, i64>(5)?,
                ))
            },
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let Some((
        active_month,
        active_view,
        currency,
        locale,
        opening_balance_cents,
        projection_months,
    )) = settings
    else {
        return Ok(None);
    };

    let mut people_query = connection
        .prepare("SELECT id, name FROM people ORDER BY sort_order, name")
        .map_err(|error| error.to_string())?;
    let people = people_query
        .query_map([], |row| {
            Ok(Person {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    let mut transactions_query = connection
        .prepare(
            "SELECT id, kind, name, category, person, amount_cents, schedule_type,
                    start_month, COALESCE(end_month, ''), installments, due_day, note, created_at
             FROM transactions ORDER BY created_at, id",
        )
        .map_err(|error| error.to_string())?;
    let transactions = transactions_query
        .query_map([], |row| {
            Ok(FinanceTransaction {
                id: row.get(0)?,
                kind: row.get(1)?,
                name: row.get(2)?,
                category: row.get(3)?,
                person: row.get(4)?,
                amount_cents: row.get(5)?,
                schedule: Schedule {
                    schedule_type: row.get(6)?,
                    start_month: row.get(7)?,
                    end_month: row.get(8)?,
                    installments: row.get(9)?,
                },
                due_day: row.get(10)?,
                note: row.get(11)?,
                created_at: row.get(12)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    let mut status_query = connection
        .prepare("SELECT transaction_id, month_key, status FROM occurrence_status")
        .map_err(|error| error.to_string())?;
    let status_rows = status_query
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    let occurrence_status = status_rows
        .into_iter()
        .map(|(transaction_id, month_key, status)| {
            (format!("{transaction_id}:{month_key}"), status)
        })
        .collect();

    Ok(Some(AppSnapshot {
        version: 3,
        active_month,
        active_view,
        settings: Settings {
            currency,
            locale,
            opening_balance_cents,
            projection_months,
        },
        people,
        transactions,
        occurrence_status,
    }))
}

fn load_state(connection: &Connection) -> Result<Option<Value>, String> {
    if let Some(snapshot) = load_normalized_state(connection)? {
        return serde_json::to_value(snapshot)
            .map(Some)
            .map_err(|error| error.to_string());
    }
    let legacy_json = connection
        .query_row("SELECT state_json FROM app_state WHERE id = 1", [], |row| {
            row.get::<_, String>(0)
        })
        .optional()
        .map_err(|error| error.to_string())?;
    legacy_json
        .map(|payload| serde_json::from_str(&payload).map_err(|error| error.to_string()))
        .transpose()
}

fn save_snapshot(
    connection: &mut Connection,
    snapshot: AppSnapshot,
    backup: Option<(&str, &str)>,
) -> Result<(), String> {
    validate_snapshot(&snapshot)?;
    if let Some((source_key, payload)) = backup {
        if source_key.trim().is_empty() || source_key.len() > 128 {
            return Err("El origen del respaldo no es válido.".into());
        }
        if payload.len() > MAX_BACKUP_BYTES {
            return Err("El respaldo de migración supera el límite permitido.".into());
        }
    }
    let state_json = serde_json::to_string(&snapshot).map_err(|error| error.to_string())?;
    let updated_at = timestamp();
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;

    if let Some((source_key, payload)) = backup {
        transaction
            .execute(
                "INSERT INTO migration_backups (source_key, payload_json, created_at)
                 VALUES (?1, ?2, ?3)",
                params![source_key, payload, updated_at],
            )
            .map_err(|error| error.to_string())?;
    }

    transaction
        .execute("DELETE FROM occurrence_status", [])
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM transactions", [])
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM people", [])
        .map_err(|error| error.to_string())?;

    transaction
        .execute(
            "INSERT INTO app_settings (
               id, active_month, active_view, currency, locale,
               opening_balance_cents, projection_months, updated_at
             ) VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(id) DO UPDATE SET
               active_month = excluded.active_month,
               active_view = excluded.active_view,
               currency = excluded.currency,
               locale = excluded.locale,
               opening_balance_cents = excluded.opening_balance_cents,
               projection_months = excluded.projection_months,
               updated_at = excluded.updated_at",
            params![
                snapshot.active_month,
                snapshot.active_view,
                snapshot.settings.currency,
                snapshot.settings.locale,
                snapshot.settings.opening_balance_cents,
                snapshot.settings.projection_months,
                updated_at,
            ],
        )
        .map_err(|error| error.to_string())?;

    for (index, person) in snapshot.people.iter().enumerate() {
        transaction
            .execute(
                "INSERT INTO people (id, name, sort_order) VALUES (?1, ?2, ?3)",
                params![person.id, person.name, index as i64],
            )
            .map_err(|error| error.to_string())?;
    }

    for item in &snapshot.transactions {
        let end_month = (!item.schedule.end_month.is_empty()).then_some(&item.schedule.end_month);
        transaction
            .execute(
                "INSERT INTO transactions (
                   id, kind, name, category, person, amount_cents, schedule_type,
                   start_month, end_month, installments, due_day, note, created_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                params![
                    item.id,
                    item.kind,
                    item.name,
                    item.category,
                    item.person,
                    item.amount_cents,
                    item.schedule.schedule_type,
                    item.schedule.start_month,
                    end_month,
                    item.schedule.installments,
                    item.due_day,
                    item.note,
                    item.created_at,
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    for (key, status) in &snapshot.occurrence_status {
        let (transaction_id, month_key) = key
            .rsplit_once(':')
            .ok_or_else(|| "Estado mensual inválido.".to_string())?;
        transaction
            .execute(
                "INSERT INTO occurrence_status (transaction_id, month_key, status)
                 VALUES (?1, ?2, ?3)",
                params![transaction_id, month_key, status],
            )
            .map_err(|error| error.to_string())?;
    }

    transaction
        .execute(
            "INSERT INTO app_state (id, state_json, data_version, updated_at)
             VALUES (1, ?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET
               state_json = excluded.state_json,
               data_version = excluded.data_version,
               updated_at = excluded.updated_at",
            params![state_json, DATA_VERSION, updated_at],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn load_app_state(app: AppHandle) -> Result<Option<Value>, String> {
    let connection = open_database(&app)?;
    load_state(&connection)
}

#[tauri::command]
pub fn save_app_state(app: AppHandle, snapshot: Value) -> Result<(), String> {
    let snapshot =
        serde_json::from_value::<AppSnapshot>(snapshot).map_err(|error| error.to_string())?;
    let mut connection = open_database(&app)?;
    save_snapshot(&mut connection, snapshot, None)
}

#[tauri::command]
pub fn migrate_legacy_state(
    app: AppHandle,
    source_key: String,
    payload_json: String,
    snapshot: Value,
) -> Result<(), String> {
    let snapshot =
        serde_json::from_value::<AppSnapshot>(snapshot).map_err(|error| error.to_string())?;
    let mut connection = open_database(&app)?;
    save_snapshot(
        &mut connection,
        snapshot,
        Some((&source_key, &payload_json)),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_snapshot() -> AppSnapshot {
        AppSnapshot {
            version: 3,
            active_month: "2026-08".into(),
            active_view: "dashboard".into(),
            settings: Settings {
                currency: "ARS".into(),
                locale: "es-AR".into(),
                opening_balance_cents: -1250,
                projection_months: 12,
            },
            people: vec![Person {
                id: "person-shared".into(),
                name: "Compartido".into(),
            }],
            transactions: vec![FinanceTransaction {
                id: "tx-1".into(),
                kind: "expense".into(),
                name: "Compra".into(),
                category: "Hogar".into(),
                person: "Compartido".into(),
                amount_cents: 10001,
                schedule: Schedule {
                    schedule_type: "installment".into(),
                    start_month: "2026-08".into(),
                    end_month: String::new(),
                    installments: 3,
                },
                due_day: 10,
                note: String::new(),
                created_at: "2026-08-01T00:00:00.000Z".into(),
            }],
            occurrence_status: HashMap::from([("tx-1:2026-08".into(), "paid".into())]),
        }
    }

    fn memory_database() -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .unwrap();
        initialize_schema(&connection).unwrap();
        connection
    }

    #[test]
    fn normalized_state_round_trips_without_losing_cents() {
        let expected = sample_snapshot();
        let mut connection = memory_database();
        save_snapshot(&mut connection, expected.clone(), None).unwrap();
        let actual: AppSnapshot =
            serde_json::from_value(load_state(&connection).unwrap().unwrap()).unwrap();
        assert_eq!(actual, expected);
    }

    #[test]
    fn migration_preserves_source_and_state_in_one_commit() {
        let mut connection = memory_database();
        save_snapshot(
            &mut connection,
            sample_snapshot(),
            Some(("ilara-finanzas-v3", r#"{"version":3}"#)),
        )
        .unwrap();
        let backup_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM migration_backups", [], |row| {
                row.get(0)
            })
            .unwrap();
        let transaction_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM transactions", [], |row| row.get(0))
            .unwrap();
        assert_eq!(backup_count, 1);
        assert_eq!(transaction_count, 1);
    }

    #[test]
    fn orphan_occurrence_is_rejected_without_replacing_previous_state() {
        let mut connection = memory_database();
        let original = sample_snapshot();
        save_snapshot(&mut connection, original.clone(), None).unwrap();
        let mut invalid = original.clone();
        invalid
            .occurrence_status
            .insert("missing:2026-08".into(), "paid".into());
        assert!(save_snapshot(&mut connection, invalid, None).is_err());
        let actual: AppSnapshot =
            serde_json::from_value(load_state(&connection).unwrap().unwrap()).unwrap();
        assert_eq!(actual, original);
    }
    #[test]
    fn failed_database_write_rolls_back_backup_and_state() {
        let mut connection = memory_database();
        let original = sample_snapshot();
        save_snapshot(&mut connection, original.clone(), None).unwrap();
        connection
            .execute_batch(
                "CREATE TRIGGER reject_transactions
                 BEFORE INSERT ON transactions
                 BEGIN
                   SELECT RAISE(ABORT, 'forced failure');
                 END;",
            )
            .unwrap();

        let result = save_snapshot(
            &mut connection,
            sample_snapshot(),
            Some(("ilara-finanzas-v3", r#"{"version":3}"#)),
        );
        assert!(result.is_err());
        let backup_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM migration_backups", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(backup_count, 0);

        connection
            .execute_batch("DROP TRIGGER reject_transactions;")
            .unwrap();
        let actual: AppSnapshot =
            serde_json::from_value(load_state(&connection).unwrap().unwrap()).unwrap();
        assert_eq!(actual, original);
    }

    #[test]
    fn alpha_one_json_remains_available_for_frontend_migration() {
        let connection = memory_database();
        let legacy = r#"{"version":3,"settings":{"openingBalance":10.25},"transactions":[{"amount":99.99}]}"#;
        connection
            .execute(
                "INSERT INTO app_state (id, state_json, data_version, updated_at)
                 VALUES (1, ?1, 3, 'before-alpha-2')",
                [legacy],
            )
            .unwrap();
        assert_eq!(
            load_state(&connection).unwrap().unwrap()["settings"]["openingBalance"],
            10.25
        );
    }
}
