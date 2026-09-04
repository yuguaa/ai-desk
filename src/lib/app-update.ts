import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";

export type AppUpdateInfo = {
  currentVersion: string;
  latestVersion: string;
  update: Update | null;
};

export function checkForAppUpdate(currentVersion: string): Promise<AppUpdateInfo> {
  return check().then((update) => ({
    currentVersion,
    latestVersion: update?.version ?? currentVersion,
    update,
  }));
}

export function downloadAppUpdate(update: Update, onProgress?: (event: DownloadEvent) => void): Promise<void> {
  return update.download(onProgress);
}

export function installDownloadedAppUpdate(update: Update): Promise<void> {
  return update.install();
}

export function relaunchApp(): Promise<void> {
  return relaunch();
}
