import type { PiContextUsage, PiConversationState, PiExtensionDialogRequest, PiExtensionRequest, PiExtensionWidget, PiModel } from "@/lib/pi-runtime";

export const EMPTY_PI_CONVERSATION_STATE: PiConversationState = {
  model: null,
  thinkingLevel: null,
  contextUsage: null,
  availableModels: [],
  availableThinkingLevels: [],
  pendingCommandIds: [],
  lastError: null,
  lastStderr: null,
  activeExtensionRequest: null,
  extensionRequestQueue: [],
  extensionNotifications: [],
  extensionStatuses: {},
  extensionWidgets: {},
  extensionTitle: null,
  extensionEditorText: "",
};

export function applyPiRpcResponse(current: PiConversationState | undefined, event: Record<string, unknown>): PiConversationState {
  const next = cloneConversationState(current);
  const command = String(event.command ?? "");
  const data = event.data && typeof event.data === "object" ? event.data as Record<string, unknown> : {};

  if (event.success === false) {
    next.lastError = formatRpcError(command, event.error);
    return next;
  }

  next.lastError = null;

  if (command === "get_state") {
    next.model = normalizePiModel(data.model);
    next.thinkingLevel = typeof data.thinkingLevel === "string" ? data.thinkingLevel : next.thinkingLevel;
    if (!next.contextUsage) next.contextUsage = initialContextUsage(next.model);
  }
  if (command === "set_model") {
    next.model = normalizePiModel(data.model) ?? normalizePiModel(data) ?? next.model;
    next.thinkingLevel = typeof data.thinkingLevel === "string" ? data.thinkingLevel : next.thinkingLevel;
  }
  if (command === "get_available_models") {
    next.availableModels = Array.isArray(data.models) ? data.models.map(normalizePiModel).filter((model): model is PiModel => Boolean(model)) : [];
  }
  if (command === "get_available_thinking_levels") {
    next.availableThinkingLevels = Array.isArray(data.levels) ? data.levels.filter((level): level is string => typeof level === "string") : [];
  }
  if (command === "get_session_stats") next.contextUsage = normalizePiContextUsage(data.contextUsage) ?? initialContextUsage(next.model);
  if (command === "set_thinking_level" && typeof data.level === "string") next.thinkingLevel = data.level;
  return next;
}

export function trackPendingPiCommand(current: PiConversationState | undefined, commandId: string) {
  const next = cloneConversationState(current);
  if (!commandId || next.pendingCommandIds.includes(commandId)) return next;
  next.pendingCommandIds = [...next.pendingCommandIds, commandId];
  return next;
}

export function settlePendingPiCommand(current: PiConversationState | undefined, commandId: string) {
  const next = cloneConversationState(current);
  if (!commandId) return next;
  next.pendingCommandIds = next.pendingCommandIds.filter((id) => id !== commandId);
  return next;
}

export function applyPiProcessStderr(current: PiConversationState | undefined, message: string) {
  const next = cloneConversationState(current);
  next.lastStderr = message;
  next.lastError = message;
  return next;
}

export function applyPiError(current: PiConversationState | undefined, message: string) {
  const next = cloneConversationState(current);
  next.lastError = message;
  return next;
}

export function applyPiExtensionUiRequest(current: PiConversationState | undefined, event: Record<string, unknown>) {
  const next = cloneConversationState(current);
  const request = normalizeExtensionUiRequest(event);
  if (!request) return next;

  if (request.method === "select" || request.method === "confirm" || request.method === "input" || request.method === "editor") {
    if (!next.extensionRequestQueue.some((current) => current.id === request.id)) {
      next.extensionRequestQueue = [...next.extensionRequestQueue, request];
    }
    next.activeExtensionRequest = next.extensionRequestQueue[0] ?? null;
    if (request.method === "editor") next.extensionEditorText = request.prefill ?? next.extensionEditorText;
    return next;
  }

  if (request.method === "notify") {
    next.extensionNotifications = [...next.extensionNotifications, {
      id: String(request.id),
      message: request.message,
      notifyType: request.notifyType ?? "info",
    }].slice(-10);
    return next;
  }

  if (request.method === "setStatus") {
    if (request.statusText) next.extensionStatuses = { ...next.extensionStatuses, [request.statusKey]: request.statusText };
    else next.extensionStatuses = omitRecordKey(next.extensionStatuses, request.statusKey);
    return next;
  }

  if (request.method === "setWidget") {
    if (request.widgetLines?.length) {
      next.extensionWidgets = {
        ...next.extensionWidgets,
        [request.widgetKey]: {
          key: request.widgetKey,
          lines: request.widgetLines,
          placement: request.widgetPlacement ?? "belowEditor",
        },
      };
    } else next.extensionWidgets = omitRecordKey(next.extensionWidgets, request.widgetKey);
    return next;
  }

  if (request.method === "setTitle") {
    next.extensionTitle = request.title;
    return next;
  }

  if (request.method === "set_editor_text") next.extensionEditorText = request.text;
  return next;
}

export function clearActiveExtensionRequest(current: PiConversationState | undefined, requestId?: string) {
  const next = cloneConversationState(current);
  const id = requestId ?? next.activeExtensionRequest?.id;
  next.extensionRequestQueue = id
    ? next.extensionRequestQueue.filter((request) => request.id !== id)
    : next.extensionRequestQueue.slice(1);
  next.activeExtensionRequest = next.extensionRequestQueue[0] ?? null;
  return next;
}

export function normalizePiModel(value: unknown): PiModel | null {
  if (!value || typeof value !== "object") return null;
  const model = value as Record<string, unknown>;
  if (typeof model.id !== "string" || typeof model.provider !== "string") return null;
  return {
    id: model.id,
    provider: model.provider,
    name: typeof model.name === "string" ? model.name : undefined,
    reasoning: typeof model.reasoning === "boolean" ? model.reasoning : undefined,
    contextWindow: isPositiveFiniteNumber(model.contextWindow) ? model.contextWindow : undefined,
  };
}

export function normalizePiContextUsage(value: unknown): PiContextUsage | null {
  if (!value || typeof value !== "object") return null;
  const usage = value as Record<string, unknown>;
  if (!isPositiveFiniteNumber(usage.contextWindow)) return null;
  if (usage.tokens !== null && !isNonNegativeFiniteNumber(usage.tokens)) return null;
  if (usage.percent !== null && !isNonNegativeFiniteNumber(usage.percent)) return null;
  return {
    contextWindow: usage.contextWindow,
    tokens: usage.tokens,
    percent: usage.percent,
  };
}

function initialContextUsage(model: PiModel | null): PiContextUsage | null {
  if (!model?.contextWindow) return null;
  return { tokens: 0, contextWindow: model.contextWindow, percent: 0 };
}

function cloneConversationState(current: PiConversationState | undefined): PiConversationState {
  const base = current ?? EMPTY_PI_CONVERSATION_STATE;
  return {
    ...EMPTY_PI_CONVERSATION_STATE,
    ...base,
    pendingCommandIds: [...base.pendingCommandIds],
    availableModels: [...base.availableModels],
    availableThinkingLevels: [...base.availableThinkingLevels],
    extensionNotifications: [...base.extensionNotifications],
    extensionRequestQueue: [...base.extensionRequestQueue],
    extensionStatuses: { ...base.extensionStatuses },
    extensionWidgets: { ...base.extensionWidgets },
  };
}

function formatRpcError(command: string, error: unknown) {
  const message = typeof error === "string" && error.trim() ? error : "Pi RPC 请求失败";
  return command ? `${command}: ${message}` : message;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function normalizeExtensionUiRequest(event: Record<string, unknown>): PiExtensionRequest | null {
  if (event.type !== "extension_ui_request" || typeof event.method !== "string" || typeof event.id !== "string") return null;
  const request = event as Record<string, unknown>;
  if (request.method === "select") {
    return {
      type: "extension_ui_request",
      id: String(request.id),
      method: "select",
      title: typeof request.title === "string" ? request.title : "选择",
      options: Array.isArray(request.options) ? request.options.filter((item): item is string => typeof item === "string") : [],
      timeout: typeof request.timeout === "number" ? request.timeout : undefined,
    } satisfies PiExtensionDialogRequest;
  }
  if (request.method === "confirm") {
    return {
      type: "extension_ui_request",
      id: String(request.id),
      method: "confirm",
      title: typeof request.title === "string" ? request.title : "确认",
      message: typeof request.message === "string" ? request.message : "",
      timeout: typeof request.timeout === "number" ? request.timeout : undefined,
    } satisfies PiExtensionDialogRequest;
  }
  if (request.method === "input") {
    return {
      type: "extension_ui_request",
      id: String(request.id),
      method: "input",
      title: typeof request.title === "string" ? request.title : "输入",
      placeholder: typeof request.placeholder === "string" ? request.placeholder : undefined,
      timeout: typeof request.timeout === "number" ? request.timeout : undefined,
    } satisfies PiExtensionDialogRequest;
  }
  if (request.method === "editor") {
    return {
      type: "extension_ui_request",
      id: String(request.id),
      method: "editor",
      title: typeof request.title === "string" ? request.title : "编辑器",
      prefill: typeof request.prefill === "string" ? request.prefill : typeof request.text === "string" ? request.text : undefined,
    } satisfies PiExtensionDialogRequest;
  }
  if (request.method === "notify" && typeof request.message === "string") {
    return {
      type: "extension_ui_request",
      id: String(request.id),
      method: "notify",
      message: request.message,
      notifyType: request.notifyType === "warning" || request.notifyType === "error" ? request.notifyType : "info",
    };
  }
  if (request.method === "setStatus" && typeof request.statusKey === "string") {
    return {
      type: "extension_ui_request",
      id: String(request.id),
      method: "setStatus",
      statusKey: request.statusKey,
      statusText: typeof request.statusText === "string" ? request.statusText : undefined,
    };
  }
  if (request.method === "setWidget" && typeof request.widgetKey === "string") {
    return {
      type: "extension_ui_request",
      id: String(request.id),
      method: "setWidget",
      widgetKey: request.widgetKey,
      widgetLines: Array.isArray(request.widgetLines) ? request.widgetLines.filter((line): line is string => typeof line === "string") : undefined,
      widgetPlacement: request.widgetPlacement === "aboveEditor" ? "aboveEditor" : request.widgetPlacement === "belowEditor" ? "belowEditor" : undefined,
    };
  }
  if (request.method === "setTitle" && typeof request.title === "string") {
    return {
      type: "extension_ui_request",
      id: String(request.id),
      method: "setTitle",
      title: request.title,
    };
  }
  if (request.method === "set_editor_text" && typeof request.text === "string") {
    return {
      type: "extension_ui_request",
      id: String(request.id),
      method: "set_editor_text",
      text: String(request.text),
    };
  }
  return null;
}

function omitRecordKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record };
  delete next[key];
  return next;
}

export function normalizeExtensionWidgets(widgets: Record<string, PiExtensionWidget>) {
  return widgets;
}
