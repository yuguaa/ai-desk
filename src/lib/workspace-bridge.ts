import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { isTauriRuntime } from "@/lib/pi-bridge";
import type { FilePreview, GitAction, GitStatus, WorkspaceFile } from "@/types/workspace";

export type GitSnapshotTree = string | null;
export type GitSnapshotStatus = GitStatus;
export type WorkspaceChangedEvent = { cwd: string };

export function listWorkspaceFiles(cwd: string) {
  if (!isTauriRuntime()) return Promise.resolve<WorkspaceFile[]>([]);
  return invoke<WorkspaceFile[]>("list_workspace_files", { cwd });
}

export function readWorkspaceFile(cwd: string, path: string) {
  if (!isTauriRuntime()) return Promise.resolve<FilePreview | null>(null);
  return invoke<FilePreview>("read_workspace_file", { cwd, path });
}

export function getGitStatus(cwd: string) {
  if (!isTauriRuntime()) return Promise.resolve<GitStatus | null>(null);
  return invoke<GitStatus>("get_git_status", { cwd });
}

export function getGitDiff(cwd: string, path: string) {
  if (!isTauriRuntime()) return Promise.resolve("");
  return invoke<string>("get_git_diff", { cwd, path });
}

export function runGitAction(cwd: string, action: GitAction) {
  if (!isTauriRuntime()) return Promise.resolve();
  return invoke<void>("run_git_action", { cwd, action });
}

export function captureGitSnapshot(cwd: string) {
  if (!isTauriRuntime()) return Promise.resolve<GitSnapshotTree>(null);
  return invoke<GitSnapshotTree>("capture_git_snapshot", { cwd });
}

export function getGitSnapshotStatus(cwd: string, baselineTree: string) {
  if (!isTauriRuntime()) return Promise.resolve<GitSnapshotStatus | null>(null);
  return invoke<GitSnapshotStatus | null>("get_git_snapshot_status", { cwd, baseline: baselineTree });
}

export function getGitSnapshotDiff(cwd: string, baselineTree: string, path: string) {
  if (!isTauriRuntime()) return Promise.resolve("");
  return invoke<string>("get_git_snapshot_diff", { cwd, baseline: baselineTree, path });
}

export function releaseGitSnapshot(cwd: string, snapshot: string) {
  if (!isTauriRuntime()) return Promise.resolve();
  return invoke<void>("release_git_snapshot", { cwd, snapshot });
}

export function pickProjectDirectory() {
  if (!isTauriRuntime()) return Promise.resolve<string | null>(null);
  return open({ title: "新建或打开项目", directory: true, multiple: false, canCreateDirectories: true }).then((path) => typeof path === "string" ? path : null);
}

export function startWorkspaceWatch(cwd: string) {
  if (!isTauriRuntime()) return Promise.resolve();
  return invoke<void>("start_workspace_watch", { cwd });
}

export function stopWorkspaceWatch() {
  if (!isTauriRuntime()) return Promise.resolve();
  return invoke<void>("stop_workspace_watch");
}

export function listenWorkspaceChanges(handler: (payload: WorkspaceChangedEvent) => void) {
  if (!isTauriRuntime()) return Promise.resolve<() => void>(() => undefined);
  return listen<WorkspaceChangedEvent>("workspace-changed", (event) => handler(event.payload));
}
