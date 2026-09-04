import { useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import type { Update } from "@tauri-apps/plugin-updater";
import { checkForAppUpdate, downloadAppUpdate, installDownloadedAppUpdate, relaunchApp } from "@/lib/app-update";

export type AppUpdateState =
  | { status: "idle" }
  | { status: "versionError" }
  | { status: "checking" }
  | { status: "latest"; latestVersion: string }
  | { status: "checkFailed" }
  | { status: "available"; latestVersion: string }
  | { status: "downloading"; latestVersion: string; progress: number | null }
  | { status: "downloadFailed"; latestVersion: string }
  | { status: "downloaded"; latestVersion: string }
  | { status: "installing"; latestVersion: string }
  | { status: "installFailed"; latestVersion: string }
  | { status: "restarting"; latestVersion: string }
  | { status: "restartRequired"; latestVersion: string };

export type AppUpdateController = {
  currentVersion: string | null;
  state: AppUpdateState;
  canCheck: boolean;
  checkUpdate: () => void;
  downloadUpdate: () => void;
  installUpdate: () => void;
  restartApp: () => void;
};

export function useAppUpdate(isTauri: boolean): AppUpdateController {
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [state, setState] = useState<AppUpdateState>({ status: "idle" });
  const stateRef = useRef<AppUpdateState>(state);
  const updateRef = useRef<Update | null>(null);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);

  const updateState = (nextState: AppUpdateState) => {
    stateRef.current = nextState;
    setState(nextState);
  };

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    mountedRef.current = true;
    if (isTauri) {
      getVersion()
        .then((version) => { if (mountedRef.current && generationRef.current === generation) setCurrentVersion(version); })
        .catch(() => { if (mountedRef.current && generationRef.current === generation) updateState({ status: "versionError" }); });
    }

    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      closeUpdateResource(updateRef.current);
      updateRef.current = null;
    };
  }, [isTauri]);

  const checkUpdate = () => {
    if (!currentVersion || !isCheckableState(stateRef.current)) return;
    const generation = generationRef.current;
    updateState({ status: "checking" });
    checkForAppUpdate(currentVersion)
      .then((result) => {
        if (!mountedRef.current || generationRef.current !== generation) {
          closeUpdateResource(result.update);
          return;
        }
        const previousUpdate = updateRef.current;
        updateRef.current = result.update;
        if (previousUpdate !== result.update) closeUpdateResource(previousUpdate);
        updateState(result.update
          ? { status: "available", latestVersion: result.latestVersion }
          : { status: "latest", latestVersion: result.latestVersion });
      })
      .catch(() => { if (mountedRef.current && generationRef.current === generation) updateState({ status: "checkFailed" }); });
  };

  const downloadUpdate = () => {
    const currentState = stateRef.current;
    const update = updateRef.current;
    if ((currentState.status !== "available" && currentState.status !== "downloadFailed") || !update) return;

    const { latestVersion } = currentState;
    const generation = generationRef.current;
    let totalBytes: number | null = null;
    let downloadedBytes = 0;
    updateState({ status: "downloading", latestVersion, progress: null });
    downloadAppUpdate(update, (event) => {
      if (!mountedRef.current || generationRef.current !== generation || updateRef.current !== update || stateRef.current.status !== "downloading") return;
      if (event.event === "Started") {
        totalBytes = event.data.contentLength ?? null;
        updateState({ status: "downloading", latestVersion, progress: totalBytes === null ? null : 0 });
        return;
      }
      if (event.event === "Progress") {
        downloadedBytes += event.data.chunkLength;
        const progress = totalBytes === null
          ? null
          : Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
        updateState({ status: "downloading", latestVersion, progress });
      }
    })
      .then(() => {
        if (!mountedRef.current || generationRef.current !== generation || updateRef.current !== update) {
          closeUpdateResource(update);
          return;
        }
        updateState({ status: "downloaded", latestVersion });
      })
      .catch(() => {
        if (mountedRef.current && generationRef.current === generation && updateRef.current === update) updateState({ status: "downloadFailed", latestVersion });
      });
  };

  const installUpdate = () => {
    const currentState = stateRef.current;
    const update = updateRef.current;
    if ((currentState.status !== "downloaded" && currentState.status !== "installFailed") || !update) return;

    const { latestVersion } = currentState;
    const generation = generationRef.current;
    updateState({ status: "installing", latestVersion });
    installDownloadedAppUpdate(update)
      .then(() => {
        if (!mountedRef.current || generationRef.current !== generation || updateRef.current !== update) return;
        updateRef.current = null;
        updateState({ status: "restarting", latestVersion });
        relaunchApp().catch(() => {
          if (mountedRef.current && generationRef.current === generation && stateRef.current.status === "restarting") updateState({ status: "restartRequired", latestVersion });
        });
      })
      .catch(() => {
        if (mountedRef.current && generationRef.current === generation && updateRef.current === update) updateState({ status: "installFailed", latestVersion });
      });
  };

  const restartApp = () => {
    const currentState = stateRef.current;
    if (currentState.status !== "restartRequired") return;
    const { latestVersion } = currentState;
    const generation = generationRef.current;
    updateState({ status: "restarting", latestVersion });
    relaunchApp().catch(() => {
      if (mountedRef.current && generationRef.current === generation && stateRef.current.status === "restarting") updateState({ status: "restartRequired", latestVersion });
    });
  };

  return { currentVersion, state, canCheck: Boolean(currentVersion && isCheckableState(state)), checkUpdate, downloadUpdate, installUpdate, restartApp };
}

function isCheckableState(state: AppUpdateState) {
  return state.status === "idle" || state.status === "latest" || state.status === "checkFailed" || state.status === "available" || state.status === "downloadFailed";
}

function closeUpdateResource(update: Update | null) {
  if (!update) return;
  update.close().catch((error: unknown) => console.warn("释放应用更新资源失败", error));
}
