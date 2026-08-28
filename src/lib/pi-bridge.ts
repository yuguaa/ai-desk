import { invoke } from "@tauri-apps/api/core";

export type PiConversationSummary = {
  id: string;
  title: string;
  preview: string;
  time: string;
  sessionFile: string;
  modifiedAt: string;
  messageCount: number;
};

export type PiProjectSummary = {
  id: string;
  name: string;
  path: string;
  conversations: PiConversationSummary[];
};

export type PiSessionView = {
  id: string;
  cwd: string;
  name?: string;
  leafId?: string;
  entries: Record<string, unknown>[];
  activeEntries: Record<string, unknown>[];
};

export function isTauriRuntime() {
  return typeof window !== "undefined" && typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ === "object";
}

export function isMacTauriRuntime() {
  return isTauriRuntime() && /Macintosh|Mac OS X/.test(navigator.userAgent);
}

export function listPiProjects() {
  if (!isTauriRuntime()) return Promise.resolve<PiProjectSummary[]>([]);
  return invoke<PiProjectSummary[]>("list_pi_projects");
}

export function readPiSession(sessionFile: string) {
  if (!isTauriRuntime()) return Promise.resolve<PiSessionView | null>(null);
  return invoke<PiSessionView>("read_pi_session", { sessionFile });
}

export function renamePiSession(sessionFile: string, name: string) {
  if (!isTauriRuntime()) return Promise.resolve();
  return invoke<void>("rename_pi_session", { sessionFile, name, timestamp: new Date().toISOString() });
}
