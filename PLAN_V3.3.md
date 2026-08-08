# Ilara V3.3 — Plan de entrega

Estado: propuesta  
Origen: Auditoría Grok (2026-08-02)  
Base: 3.2.0 estable  
Enfoque: foundation sync-ready sin nube — el modelo, no el backend

## 0. Por qué existe esta versión

La V3.2 es sólida como app de **un solo dispositivo**.  
La V4 quiere **varias PCs + web iPhone + sync en tiempo real**.

Si se salta directo a V4 sobre el snapshot actual:

- cada cambio reescribe el mundo entero;
- no hay `updatedAt` / `rev` / tombstones;
- personas y categorías se referencian por nombre;
- la UI y el ledger viven en el mismo blob;
- no hay cola de operaciones (outbox).

V3.3 **no sincroniza todavía**. Deja el ledger listo para que V4 sea “conectar transporte + auth”, no “reescribir la contabilidad”.

Relación de versiones:

```text
3.2  uso diario local (actual)
3.3  foundation sync-ready (este plan)
3.4  core compartido + shell web offline (opcional, puente)
4.0  cuentas + outbox + realtime + migración 3.2/3.3
4.1  conflictos UX, roles, audit, hardening
```

## 1. Objetivo

Ilara V3.3 es una entrega **solo desktop (Tauri)**, compatible con datos 3.2, que:

1. Separa **preferencias locales** del **ledger del hogar**.
2. Versiona cada entidad sincronizable (`id`, `createdAt`, `updatedAt`, `deletedAt`, `rev`, `originDeviceId`).
3. Referencia personas y categorías por **ID estable**, no solo por nombre.
4. Extrae **mutators de dominio** testeables fuera de `app.js`.
5. Persiste con **escrituras incrementales** (no DELETE-all + INSERT-all en cada click).
6. Introduce una **outbox local** de operaciones (aún sin servidor: se encola y se puede exportar/inspeccionar).
7. Modulariza el frontend y avanza TypeScript en el núcleo.

Al terminar 3.3, un segundo dispositivo **todavía no se sincroniza solo**, pero el protocolo interno ya habla el idioma de V4.

## 2. Alcance comprometido

### 2.1 Modelo de datos

- Envelope común en entidades de dominio:
  - `people`, `categories`, `transactions` (series), `occurrence_records`, `budgets`, `closed_months`, `settings` de hogar.
- Campos mínimos del envelope:
  - `id` (UUID, obligatorio en categorías también)
  - `createdAt` (ISO-8601)
  - `updatedAt` (ISO-8601)
  - `deletedAt` (null | ISO) — soft-delete / tombstone
  - `rev` (entero monotónico por entidad, empieza en 1)
  - `originDeviceId` (UUID del dispositivo que creó o tocó por última vez)
- `deviceId` local generado una vez y guardado en preferencias **no sincronizables**.
- `personId` y `categoryId` en series y presupuestos.
- Nombres denormalizados **solo** en ocurrencias materializadas (historia legible si se renombra después).
- Snapshot de dominio versionado: `version: 4` en el ledger (o `dataModelVersion: 4` manteniendo `version` de app si se prefiere; decisión en Fase A y documentada).
- Preferencias locales fuera del ledger:
  - `activeMonth`, `activeView`, tema futuro, filtros de UI.
- Migración automática 3.2 → 3.3 en SQLite, transaccional, con backup previo (mismo espíritu que 3.1 → 3.2).

### 2.2 Mutaciones y dominio

- Módulo `ledger` (TypeScript o JS estricto migrable) con mutators puros, por ejemplo:
  - `payOccurrence` / `unpayOccurrence`
  - `upsertSeries` / `editSeriesCurrent` / `editSeriesFuture` / `editSeriesAll`
  - `deleteSeriesCurrent|Future|All`
  - `closeMonth` / `reopenMonth`
  - `upsertBudget` / `removeBudget`
  - `upsertPerson` / `renamePerson` / `removePerson`
  - `upsertCategory` / `renameCategory` / `removeCategory`
  - `updateHouseholdSettings` (saldo inicial, proyección, etc.)
- Cada mutator:
  - recibe estado + comando;
  - devuelve `{ nextState, ops[] }` sin tocar el DOM;
  - actualiza `updatedAt`, incrementa `rev`, setea `originDeviceId`;
  - en deletes usa `deletedAt` (no borrar filas físicas de entidades sync, salvo garbage opcional local de prefs).
- `finance-core` sigue siendo puro y se reutiliza desde mutators.
- `app.js` (o sus módulos) solo: eventos UI → mutator → persist → render.

### 2.3 Persistencia

- Nueva migración SQL `0004_sync_ready_foundation.sql` (nombre final libre, user_version = 4).
- Writes **incrementales**:
  - UPSERT/UPDATE por fila tocada;
  - no reescribir tablas enteras en un pago simple.
- Mantener transacción SQLite y “no hay éxito sin confirmar disco”.
- JSON completo en `app_state` pasa a ser:
  - **opcional** como checkpoint de recuperación / export interno, **no** camino principal de lectura; o
  - se genera solo en export/backup, no en cada save.
  Decisión concreta en Fase B; criterio: una sola source of truth = tablas normalizadas.
- Tabla `sync_outbox`:
  - `id`, `created_at`, `op_type`, `entity_type`, `entity_id`, `rev`, `payload_json`, `sent_at` (null en 3.3).
- Cada mutator exitoso appenda 1..N ops a la outbox **en la misma transacción** que el estado.
- Comando/diagnóstico en Ajustes: ver conteo de outbox, exportar outbox JSON (debug), “compactar checkpoint” (avanzado, opcional).
- Cola de writes del cliente (`storage.ts`) se mantiene; API del bridge puede pasar a `apply_ops` / `save_entities` además de o en lugar de `save_app_state` full.

### 2.4 Frontend y calidad

- Partir `app.js` en módulos (mínimo):
  - `state/load-normalize.ts`
  - `ledger/mutators/*`
  - `ui/dashboard`, `ui/movements`, `ui/projection`, `ui/settings`
  - `ui/dialogs`
  - `io/import-export`
- Tipar el snapshot de ledger y los comandos.
- Tests unitarios de mutators (current/future/all, mes cerrado, pago real ≠ previsto).
- Tests de migración 3.2 → 3.3 (fixture realista).
- Tests de outbox: un pago genera op esperada; rollback de TX no deja op huérfana.
- `npm run verify` sigue siendo la puerta de release.
- Backup automático al **cerrar mes** (además del pre-import), con rotación local (últimos N).
- Export/import JSON actualizado al modelo 3.3; import 3.2 sigue funcionando (migra al vuelo).

### 2.5 Producto (solo lo que ayuda a la foundation)

No es una release de “features de marketing”, pero se permiten mejoras baratas que validan el modelo:

- Resumen al cerrar mes (pendientes + desvío de presupuesto) — usa mutator `closeMonth`.
- Pantalla o sección **Diagnóstico** en Ajustes: deviceId, conteos, tamaño DB, última escritura, outbox pendiente.
- (Opcional stretch) vista “Cuotas activas” si no desvía el foco.

## 3. Fuera de alcance (explícito)

- Sincronización entre dispositivos (red, push, pull).
- Backend, Supabase, cuentas, login, invitaciones.
- Cliente web / iPhone / PWA.
- CRDTs completos o UI de resolución de conflictos multi-usuario.
- Cuentas bancarias, tarjetas, open banking.
- Multimoneda.
- Code signing (sigue recomendado, no bloquea 3.3).
- Reescritura total a un framework UI (React/Svelte/etc.) — **no** en 3.3 salvo que un módulo nuevo lo use de forma acotada; preferir modularizar vanilla/TS actual.

Estos puntos viven en 3.4 / 4.0 / 4.1.

## 4. Principios de diseño

1. **Local-first forever.** El disco local sigue siendo usable sin red (V4 no lo rompe).
2. **Ops > blobs.** Se versionan operaciones y entidades, no “el archivo entero del hogar” en cada click.
3. **Historia contable inmutable en la práctica.** Meses cerrados y pagos materializados no se reescriben en silencio (ya es regla 3.2; 3.3 la formaliza en mutators).
4. **Una source of truth.** Tablas SQLite normalizadas.
5. **Compatibilidad hacia atrás.** Un usuario 3.2 actualiza y no pierde un centavo.
6. **V4-shaped, V3-scoped.** Todo lo que se agregue debe servir al sync futuro; nada de “temporal que hay que tirar”.

## 5. Fases de implementación

### Fase 0 — Congelar y proteger (0,5–1 día)

1. Tag git `v3.2.0` si no existe; branch `v3.3`.
2. Preservar instaladores 3.2 en `release/` (no sobrescribir).
3. Export de respaldo manual recomendado en README antes de instalar alphas 3.3.
4. Checklist de humo 3.2 documentado (alta, pago real, cierre, import).

**Salida:** rama limpia, baseline intacta.

### Fase A — Contratos y separación de estado (2–4 días)

1. Definir tipos TS: `LedgerState`, `LocalPreferences`, `EntityMeta`, comandos, `OutboxOp`.
2. Separar en memoria:
   - `prefs` (activeMonth, activeView, deviceId, …)
   - `ledger` (people, categories, transactions, occurrences, budgets, closedMonths, householdSettings)
3. Persistir prefs en tabla/key local (`app_preferences`) **fuera** del paquete de sync futuro.
4. Documentar en `PLAN_V3.3` / README el mapa de campos y qué se sincronizará en V4.

**Salida:** la app 3.2 sigue comportándose igual, pero el estado mental ya está partido.  
**Criterio:** tests de normalize + load verdes; UI no regresa.

### Fase B — Migración SQL + envelope + FKs (3–5 días)

1. Migración `0004_…`:
   - columnas meta en tablas de dominio;
   - `categories.id`;
   - `transactions.person_id`, `transactions.category_id`;
   - `budgets.category_id`;
   - `sync_outbox`;
   - `app_preferences`;
   - `devices` o al menos `device_id` en prefs.
2. Migrador 3.2 → 3.3:
   - asignar UUIDs a categorías existentes;
   - resolver `personId` / `categoryId` por match de nombre (case-insensitive es);
   - rellenar `createdAt`/`updatedAt`/`rev=1`/`deletedAt=null`/`originDeviceId=local`;
   - backup en `migration_backups` antes de aplicar.
3. Validación Rust actualizada (`validate_snapshot` o validación por entidades).
4. Import JSON 3.2 y 3.3; export solo 3.3.

**Salida:** DB 3.3 en disco; usuario 3.2 migra sin pérdida.  
**Criterio:** test de migración con fixture V3.2 realista; rollback si falla.

### Fase C — Mutators + outbox + writes incrementales (4–7 días)

1. Extraer reglas de `saveMovement` / `deleteMovement` / settlement / close month a mutators.
2. Cada mutator produce `ops[]` estables (`op_type` versionado, payload canónico).
3. Repositorio Rust:
   - aplicar cambios por entidad (UPSERT/UPDATE soft);
   - insertar outbox en la misma TX;
   - eliminar o degradar el full rewrite del save path principal.
4. Mantener emergency localStorage solo para fallos graves (payload = ledger+prefs o ledger).
5. Tests:
   - scope current/future/all;
   - mes cerrado bloquea mutación;
   - pago con actual ≠ planned;
   - outbox length y contenido;
   - fallo a mitad de TX no deja estado a medias ni outbox fantasma.

**Salida:** clicks de UI ya no dependen del monstruo de reescritura global.  
**Criterio:** mismos flujos de producto 3.2; verify verde.

### Fase D — Modularizar UI + diagnóstico + release (2–4 días)

1. Split de `app.js` en módulos de vista/diálogo/io (sin rediseño visual).
2. Ajustes → Diagnóstico (deviceId, conteos, outbox, última escritura).
3. Backup al cerrar mes + rotación.
4. Resumen de cierre de mes.
5. CHANGELOG, README, bump 3.3.0 en package/Cargo/tauri/APP_VERSION.
6. `npm run release:build`; hashes; conservar 3.2 en `release/`.
7. Prueba manual de actualización 3.2 instalada → 3.3 con datos reales de prueba.

**Salida:** instalador + portable 3.3.0.  
**Criterio:** checklist de aceptación §6 en verde.

### Orden sugerido en el calendario

| Semana | Foco |
|--------|------|
| 1 | Fase 0 + A + inicio B |
| 2 | B completa + inicio C |
| 3 | C completa + D |
| + buffer | bugs de migración y regresiones de series |

Estimación total: **~2–3 semanas** de trabajo enfocado (una persona), no un trimestre.

## 6. Criterios de aceptación

### Datos y migración

- [ ] Una instalación 3.2 con datos migra a 3.3 sin pérdida ni duplicación de series, ocurrencias, pagos, cierres, presupuestos ni personas.
- [ ] Si la migración falla, queda el estado 3.2 intacto y hay ruta de recuperación.
- [ ] Categorías tienen `id` estable; renombrar categoría no rompe presupuestos ni series (actualiza nombre denormalizado donde corresponda, conserva id).
- [ ] Renombrar persona actualiza el display sin crear una persona “nueva” fantasma en reportes.

### Dominio

- [ ] Editar serie `current` / `future` / `all` se comporta como 3.2 (meses pagados/cerrados protegidos).
- [ ] Marcar pago con importe real distinto del previsto no genera pendientes negativos.
- [ ] Cerrar mes bloquea mutaciones; reabrir permite de nuevo.
- [ ] Toda mutación de dominio pasa por mutator (no hay camino paralelo que mute el state a mano en UI salvo prefs).

### Persistencia y outbox

- [ ] Un pago no reescribe tablas enteras de people/categories/transactions intactas (verificable por plan de queries o test de repositorio).
- [ ] Cada mutación exitosa deja ≥1 op en `sync_outbox` con `sent_at IS NULL`.
- [ ] Fallo de escritura revierte estado **y** outbox.
- [ ] Preferencias `activeView` / `activeMonth` no viven dentro del blob de ledger exportable de sync (pueden ir en export de backup completo de usuario, pero etiquetadas como locales).

### Producto y release

- [ ] Export/import JSON 3.3 funciona; import 3.2 migra.
- [ ] Diagnóstico visible en Ajustes.
- [ ] `npm run verify` pasa.
- [ ] Artefactos 3.3 en `release/` con SHA-256; 3.2 intacto.
- [ ] App usable offline como 3.2; sin red, sin cuentas, sin telemetría obligatoria.

### No-regresión UX

- [ ] Dashboard, movimientos, proyección, ajustes, CSV y búsqueda se sienten equivalentes a 3.2.
- [ ] No se reintroduce service worker / PWA.

## 7. Decisiones técnicas propuestas

| Tema | Decisión 3.3 | Motivo |
|------|----------------|--------|
| Source of truth | Tablas SQLite normalizadas | Evitar dual-write eterno |
| Deletes | Soft-delete (`deletedAt`) en entidades de dominio | Tombstones para V4 |
| Outbox | Append-only local, sin envío | Ensayar protocolo sin backend |
| IDs | UUID v4 (`crypto.randomUUID`) | Ya usado; extender a categories |
| Conflicto | No hay multi-dispositivo aún | Solo preparar meta |
| UI framework | Seguir con vanilla + TS modular | Menos riesgo que rewrite |
| Versión ledger | Subir modelo de datos (user_version=4 / dataModelVersion) | Distinguir de APP_VERSION 3.3.0 |
| deviceId | Generado al primer boot 3.3, estable | originDeviceId coherente |
| Full snapshot save | Deprecado como path caliente | Solo recovery/export |

### Formato tentativo de outbox op

```json
{
  "id": "op-uuid",
  "opType": "occurrence.paid",
  "entityType": "occurrence",
  "entityId": "tx-uuid:2026-08",
  "rev": 3,
  "at": "2026-08-02T15:00:00.000Z",
  "originDeviceId": "device-uuid",
  "payload": {
    "transactionId": "tx-uuid",
    "monthKey": "2026-08",
    "actualAmountCents": 18400,
    "effectiveDate": "2026-08-02",
    "plannedAmountCents": 18000
  }
}
```

Los `opType` se versionan y se documentan en `docs/ops-catalog.md` (crear en Fase C). Catálogo inicial mínimo:

- `occurrence.paid` / `occurrence.unpaid` / `occurrence.skipped`
- `series.created` / `series.updated` / `series.split_future` / `series.deleted_*`
- `month.closed` / `month.reopened`
- `budget.upserted` / `budget.removed`
- `person.*` / `category.*`
- `settings.household_updated`

## 8. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Migración de nombres → IDs ambigua (dos “Luz”) | Medio | Match case-insensitive + log; si hay colisión, conservar ambas categorías y mapear series al id más antiguo |
| Regresión en edición de series | Alto | Tests de mutator antes de tocar UI; fixture de regresión |
| Writes incrementales incompletos | Alto | Empezar por occurrence + budget; luego series; feature flag `incrementalWrites` si hace falta |
| Scope creep (“ya que estamos, web”) | Alto | Fuera de alcance explícito; cualquier web = 3.4 |
| Dual path save (viejo + nuevo) largo tiempo | Medio | Fecha de corte: al cerrar Fase C solo path nuevo en dev; alpha con flag |
| Outbox crece sin compactación | Bajo en 3.3 | Diagnóstico + “export y limpiar ops sent” (sent siempre null hasta V4); límite blando documentado |

## 9. Plan de pruebas

1. **Unit:** finance-core (existente) + mutators nuevos + normalize 3.3.
2. **Repo Rust:** migración 3.2→3.3, rollback, outbox atómica, UPSERT occurrence.
3. **Integración UI (manual o scripted):**  
   alta cuota → pago parcial/real → editar future → cerrar mes → reabrir → export → import en perfil limpio.
4. **Upgrade real:** instalar 3.2 → cargar datos → instalar 3.3 → verificar totales del mes activo y 3 meses atrás.
5. **verify completo** antes de cada alpha y del estable.

Alphas sugeridas:

- `3.3.0-alpha.1` — Fase A+B (migró, aún puede full-write).
- `3.3.0-alpha.2` — Fase C (mutators + incremental + outbox).
- `3.3.0` — Fase D estable.

## 10. Entregables

- Código en branch `v3.3` mergeado a `main` al cerrar.
- Migración SQL 0004 (+ tests).
- Módulo ledger/mutators + catálogo de ops.
- UI modularizada (sin rediseño).
- Diagnóstico en Ajustes.
- `CHANGELOG.md` sección 3.3.0.
- `README.md` actualizado (migración, diagnóstico, nota “preparado para V4, sin sync aún”).
- `release/Ilara-Finanzas-3.3.0-Windows-x64-Setup.exe` (+ portable + SHA256SUMS).
- 3.2 preservado en `release/`.

## 11. Definición de “listo para empezar V4”

V3.3 se considera fundación suficiente para abrir V4 cuando:

1. El ledger tiene meta completa y FKs por id.
2. Toda mutación de negocio genera ops de outbox de forma atómica.
3. El path de save caliente es incremental.
4. Prefs locales no contaminan el paquete de sync.
5. Hay tests de migración y de mutators de series.
6. Existe un export del ledger “puro” (sin prefs) usable como seed de household en el futuro backend.

V4 entonces se enfoca en: auth, household, transporte realtime, apply remoto, UI de conflictos, cliente web iPhone — **no** en reinventar cuotas.

## 12. Qué se le dice al usuario de la app

Texto sugerido para release notes:

> **Ilara 3.3** refuerza los cimientos internos del hogar financiero: mejor estructura de datos, guardado más eficiente y preparación para la futura sincronización entre dispositivos.  
> **Todavía no hay nube ni multi-PC automático.** Tus datos siguen 100% en este equipo.  
> Si venís de 3.2, la actualización migra sola; igual recomendamos exportar un respaldo JSON antes.

## 13. Checklist de kickoff (cuando se decida arrancar)

- [ ] Crear branch `v3.3` desde tag 3.2.0
- [ ] Export JSON de datos reales de prueba
- [ ] Abrir issues o TODOs por fase A/B/C/D
- [ ] Implementar primero tipos + tests rojos de mutator (TDD suave)
- [ ] No tocar features de producto hasta que B+C estén verdes
- [ ] Alpha interna antes de “estable”

---

**Resumen en una línea:**  
V3.3 no es “más pantallas”; es **convertir Ilara de un bloc de notas gigante a un ledger con operaciones versionadas**, sin perder la app de escritorio confiable que ya tenés.
