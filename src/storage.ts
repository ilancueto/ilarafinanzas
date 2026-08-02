import Database from "@tauri-apps/plugin-sql";

const DATABASE_URL = "sqlite:ilara.db";
const STATE_ROW_ID = 1;
const DATA_VERSION = 3;

type StateRow = {
  state_json: string;
};

let databasePromise: Promise<Database> | null = null;

function database(): Promise<Database> {
  databasePromise ??= Database.load(DATABASE_URL);
  return databasePromise;
}

export async function loadStoredState(): Promise<unknown | null> {
  const db = await database();
  const rows = await db.select<StateRow[]>(
    "SELECT state_json FROM app_state WHERE id = $1 LIMIT 1",
    [STATE_ROW_ID],
  );
  if (!rows.length) return null;
  return JSON.parse(rows[0].state_json);
}

export async function saveStoredState(snapshot: unknown): Promise<void> {
  const db = await database();
  const stateJson = JSON.stringify(snapshot);
  const updatedAt = new Date().toISOString();
  await db.execute(
    `INSERT INTO app_state (id, state_json, data_version, updated_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(id) DO UPDATE SET
       state_json = excluded.state_json,
       data_version = excluded.data_version,
       updated_at = excluded.updated_at`,
    [STATE_ROW_ID, stateJson, DATA_VERSION, updatedAt],
  );
}

export async function preserveLegacySnapshot(
  sourceKey: string,
  payloadJson: string,
): Promise<void> {
  const db = await database();
  await db.execute(
    `INSERT INTO migration_backups (source_key, payload_json, created_at)
     VALUES ($1, $2, $3)`,
    [sourceKey, payloadJson, new Date().toISOString()],
  );
}

export async function migrateLegacySnapshot(
  sourceKey: string,
  payloadJson: string,
  normalizedState: unknown,
): Promise<void> {
  await preserveLegacySnapshot(sourceKey, payloadJson);
  await saveStoredState(normalizedState);
}
