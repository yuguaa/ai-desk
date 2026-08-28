import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isTauriRuntime } from "@/lib/pi-bridge";

export type PiProcessStatus = {
  conversationId: string;
  pid: number;
  running: boolean;
  busy: boolean;
};

export type PiRuntimeEvent = {
  conversationId: string;
  event: Record<string, unknown>;
};

export type PiProcessExit = {
  conversationId: string;
  code?: number;
};

export type PiModel = {
  id: string;
  name?: string;
  provider: string;
  reasoning?: boolean;
  contextWindow?: number;
};

export type PiContextUsage = {
  percent: number | null;
  contextWindow: number;
  tokens: number | null;
};

export type PiExtensionDialogRequest =
  | { type: "extension_ui_request"; id: string; method: "select"; title: string; options: string[]; timeout?: number }
  | { type: "extension_ui_request"; id: string; method: "confirm"; title: string; message: string; timeout?: number }
  | { type: "extension_ui_request"; id: string; method: "input"; title: string; placeholder?: string; timeout?: number }
  | { type: "extension_ui_request"; id: string; method: "editor"; title: string; prefill?: string };

export type PiExtensionNotification = {
  id: string;
  message: string;
  notifyType: "info" | "warning" | "error";
};

export type PiExtensionWidget = {
  key: string;
  lines: string[];
  placement: "aboveEditor" | "belowEditor";
};

export type PiExtensionRequest =
  | PiExtensionDialogRequest
  | { type: "extension_ui_request"; id: string; method: "notify"; message: string; notifyType?: "info" | "warning" | "error" }
  | { type: "extension_ui_request"; id: string; method: "setStatus"; statusKey: string; statusText?: string }
  | { type: "extension_ui_request"; id: string; method: "setWidget"; widgetKey: string; widgetLines?: string[]; widgetPlacement?: "aboveEditor" | "belowEditor" }
  | { type: "extension_ui_request"; id: string; method: "setTitle"; title: string }
  | { type: "extension_ui_request"; id: string; method: "set_editor_text"; text: string };

export type PiExtensionResponse =
  | { type: "extension_ui_response"; id: string; value: string }
  | { type: "extension_ui_response"; id: string; confirmed: boolean }
  | { type: "extension_ui_response"; id: string; cancelled: true };

export type PiConversationState = {
  model: PiModel | null;
  thinkingLevel: string | null;
  contextUsage: PiContextUsage | null;
  availableModels: PiModel[];
  availableThinkingLevels: string[];
  pendingCommandIds: string[];
  lastError: string | null;
  lastStderr: string | null;
  activeExtensionRequest: PiExtensionDialogRequest | null;
  extensionRequestQueue: PiExtensionDialogRequest[];
  extensionNotifications: PiExtensionNotification[];
  extensionStatuses: Record<string, string>;
  extensionWidgets: Record<string, PiExtensionWidget>;
  extensionTitle: string | null;
  extensionEditorText: string;
};

export function startPiProcess(conversationId: string, cwd: string, sessionFile?: string, projectTrusted?: boolean) {
  if (!isTauriRuntime()) return Promise.resolve<PiProcessStatus | null>(null);
  const sessionId = !sessionFile && isSessionId(conversationId) ? conversationId : undefined;
  return invoke<PiProcessStatus>("start_pi_process", { conversationId, cwd, sessionFile, sessionId, projectTrusted });
}

export function sendPiCommand(conversationId: string, command: Record<string, unknown>) {
  if (!isTauriRuntime()) return Promise.resolve();
  return invoke<void>("send_pi_command", { conversationId, command });
}

export function listPiProcesses() {
  if (!isTauriRuntime()) return Promise.resolve<PiProcessStatus[]>([]);
  return invoke<PiProcessStatus[]>("list_pi_processes");
}

export function stopPiProcess(conversationId: string) {
  if (!isTauriRuntime()) return Promise.resolve();
  return invoke<void>("stop_pi_process", { conversationId });
}

export function listenPiRuntime(onEvent: (payload: PiRuntimeEvent) => void, onExit: (payload: PiProcessExit) => void) {
  if (!isTauriRuntime()) return Promise.resolve<() => void>(() => undefined);
  return Promise.all([
    listen<PiRuntimeEvent>("pi-event", (event) => onEvent(event.payload)),
    listen<PiProcessExit>("pi-process-exit", (event) => onExit(event.payload)),
  ]).then(([unlistenEvent, unlistenExit]) => () => {
    unlistenEvent();
    unlistenExit();
  });
}

export function createPiCommandId(prefix = "pi") {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function isSessionId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
