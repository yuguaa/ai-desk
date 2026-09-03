import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";

export type AppUpdateInfo = {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  update: Update | null;
};

export function checkForAppUpdate(currentVersion: string): Promise<AppUpdateInfo> {
  return check().then((update) => ({
    currentVersion,
    latestVersion: update?.version ?? currentVersion,
    updateAvailable: update !== null,
    update,
  }));
}

export function installAppUpdate(update: Update, onProgress?: (event: DownloadEvent) => void): Promise<void> {
  return update.downloadAndInstall(onProgress).then(() => relaunch());
}
