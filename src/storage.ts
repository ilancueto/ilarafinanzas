import { invoke } from "@tauri-apps/api/core";

type LegacyMigration = {
  sourceKey: string;
  payloadJson: string;
};

export type DriveStatus = {
  configured: boolean;
  connected: boolean;
  autoSync: boolean;
  email: string;
  lastSyncAt: string;
  localDirty: boolean;
  hasRemote: boolean;
  remoteModifiedTime: string;
  message: string;
};

export type DrivePullResult = {
  action: string;
  status: DriveStatus;
  content: string | null;
  remoteModifiedTime: string;
  message: string;
};

export type DrivePushResult = {
  action: string;
  status: DriveStatus;
  message: string;
};

let writeQueue: Promise<void> = Promise.resolve();

function serializeWrite(task: () => Promise<void>): Promise<void> {
  const operation = writeQueue.then(task, task);
  writeQueue = operation.catch(() => undefined);
  return operation;
}

export type DataProfileInfo = {
  id: string;
  label: string;
  databaseFile: string;
  isSandbox: boolean;
  isActive: boolean;
};

export type DataProfilesResponse = {
  active: DataProfileInfo;
  profiles: DataProfileInfo[];
};

export async function openExternalUrl(url: string): Promise<void> {
  return invoke<void>("open_external_url", { url });
}

/** Descarga el Setup de update a temp (solo GitHub). Devuelve ruta local. */
export async function downloadAppSetup(
  url: string,
  fileName: string,
  expectedSha256?: string | null,
): Promise<string> {
  return invoke<string>("download_app_setup", {
    url,
    fileName,
    expectedSha256: expectedSha256 || null,
  });
}

/** Lanza el Setup NSIS y cierra la app. silent → flag /S. */
export async function launchAppSetupAndQuit(path: string, silent = true): Promise<void> {
  return invoke<void>("launch_app_setup_and_quit", { path, silent });
}

export async function hashLocalFileSha256(path: string): Promise<string> {
  return invoke<string>("hash_local_file_sha256", { path });
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

export async function listDataProfiles(): Promise<DataProfilesResponse> {
  return invoke<DataProfilesResponse>("list_data_profiles");
}

export async function getDataProfile(): Promise<DataProfileInfo> {
  return invoke<DataProfileInfo>("get_data_profile");
}

export async function setDataProfile(profileId: string): Promise<DataProfilesResponse> {
  await writeQueue;
  const result = await invoke<DataProfilesResponse>("set_data_profile", { profileId });
  return result;
}

export async function resetSandboxProfile(): Promise<DataProfilesResponse> {
  await writeQueue;
  const result = await invoke<DataProfilesResponse>("reset_sandbox_profile");
  return result;
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

export async function driveGetStatus(): Promise<DriveStatus> {
  return invoke<DriveStatus>("drive_get_status");
}

export async function driveSaveCredentials(
  clientId: string,
  clientSecret: string,
): Promise<DriveStatus> {
  return invoke<DriveStatus>("drive_save_credentials", { clientId, clientSecret });
}

export async function driveSetAutoSync(enabled: boolean): Promise<DriveStatus> {
  return invoke<DriveStatus>("drive_set_auto_sync", { enabled });
}

export async function driveMarkLocalDirty(): Promise<DriveStatus> {
  return invoke<DriveStatus>("drive_mark_local_dirty");
}

export async function driveDisconnect(): Promise<DriveStatus> {
  return invoke<DriveStatus>("drive_disconnect");
}

export async function driveConnect(): Promise<DriveStatus> {
  return invoke<DriveStatus>("drive_connect");
}

export async function drivePush(
  content: string,
  force = false,
): Promise<DrivePushResult> {
  return invoke<DrivePushResult>("drive_push", { content, force });
}

export async function drivePull(force = false): Promise<DrivePullResult> {
  return invoke<DrivePullResult>("drive_pull", { force });
}

export async function driveConfirmPulled(
  content: string,
  remoteModifiedTime: string,
): Promise<DriveStatus> {
  return invoke<DriveStatus>("drive_confirm_pulled", { content, remoteModifiedTime });
}
