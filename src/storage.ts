import { invoke } from "@tauri-apps/api/core";

type LegacyMigration = {
  sourceKey: string;
  payloadJson: string;
};

let writeQueue: Promise<void> = Promise.resolve();

function serializeWrite(task: () => Promise<void>): Promise<void> {
  const operation = writeQueue.then(task, task);
  writeQueue = operation.catch(() => undefined);
  return operation;
}

export async function loadStoredState(): Promise<unknown | null> {
  await writeQueue;
  return invoke<unknown | null>("load_app_state");
}

export async function saveStoredState(snapshot: unknown): Promise<void> {
  return serializeWrite(() =>
    invoke<void>("save_app_state", { snapshot }),
  );
}

export async function migrateLegacySnapshot(
  sourceKey: string,
  payloadJson: string,
  snapshot: unknown,
): Promise<void> {
  const migration: LegacyMigration = { sourceKey, payloadJson };
  return serializeWrite(() =>
    invoke<void>("migrate_legacy_state", {
      ...migration,
      snapshot,
    }),
  );
}
