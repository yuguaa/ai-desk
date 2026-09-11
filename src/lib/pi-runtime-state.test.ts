import { describe, expect, it } from "vitest";
import type { PiConversationState } from "@/lib/pi-runtime";
import {
  applyPiError,
  applyPiExtensionUiRequest,
  applyPiGoalEvent,
  applyPiProcessStderr,
  applyPiRpcResponse,
  clearActiveExtensionRequest,
  EMPTY_PI_CONVERSATION_STATE,
  normalizePiModel,
  settlePendingPiCommand,
  trackPendingPiCommand,
} from "@/lib/pi-runtime-state";

describe("Pi runtime state", () => {
  it.each([
    { input: ["text", "image"], expected: ["text", "image"] },
    { input: ["audio", null, 1, "image", "text", "IMAGE"], expected: ["image", "text"] },
    { input: ["text"], expected: ["text"] },
    { input: [], expected: [] },
    { input: ["video"], expected: [] },
    { input: "image", expected: undefined },
    { input: null, expected: undefined },
    { input: undefined, expected: undefined },
  ])("仅保留协议声明的合法模型输入 $input", ({ input, expected }) => {
    expect(normalizePiModel({ id: "vision-image-model", provider: "test", input })?.input).toEqual(expected);
  });

  it("当前模型、切换模型和可用模型列表均保留图片能力", () => {
    const model = { id: "custom", provider: "test", input: ["text", "image"] };
    for (const command of ["get_state", "set_model"]) {
      const state = applyPiRpcResponse(undefined, { command, success: true, data: { model } });
      expect(state.model?.input).toEqual(["text", "image"]);
    }
    expect(applyPiRpcResponse(undefined, { command: "set_model", success: true, data: model }).model?.input).toEqual(["text", "image"]);
    expect(applyPiRpcResponse(undefined, { command: "get_available_models", success: true, data: { models: [model] } }).availableModels[0].input).toEqual(["text", "image"]);
  });

  const extension = (method: string, data: Record<string, unknown> = {}) => (state: PiConversationState) =>
    applyPiExtensionUiRequest(state, { type: "extension_ui_request", id: "new-request", method, ...data });
  const rpc = (command: string, data: Record<string, unknown> = {}) => (state: PiConversationState) =>
    applyPiRpcResponse(state, { command, success: true, data });

  it.each<[string, (state: PiConversationState) => PiConversationState, (keyof PiConversationState)[]]>([
    ["state RPC", rpc("get_state", { model: { id: "next", provider: "test" }, thinkingLevel: "high" }), ["model", "thinkingLevel", "lastError"]],
    ["model RPC", rpc("set_model", { id: "next", provider: "test" }), ["model", "lastError"]],
    ["models RPC", rpc("get_available_models", { models: [{ id: "next", provider: "test" }] }), ["availableModels", "lastError"]],
    ["levels RPC", rpc("get_available_thinking_levels", { levels: ["high"] }), ["availableThinkingLevels", "lastError"]],
    ["stats RPC", rpc("get_session_stats", { contextUsage: { tokens: 10, contextWindow: 100, percent: 10 } }), ["contextUsage", "lastError"]],
    ["thinking RPC", rpc("set_thinking_level", { level: "high" }), ["thinkingLevel", "lastError"]],
    ["unrelated RPC", rpc("prompt"), ["lastError"]],
    ["failed RPC", (state) => applyPiRpcResponse(state, { command: "prompt", success: false, error: "failed" }), ["lastError"]],
    ["pending command", (state) => trackPendingPiCommand(state, "cmd-2"), ["pendingCommandIds"]],
    ["duplicate command", (state) => trackPendingPiCommand(state, "cmd-1"), []],
    ["settled command", (state) => settlePendingPiCommand(state, "cmd-1"), ["pendingCommandIds"]],
    ["stderr", (state) => applyPiProcessStderr(state, "failed"), ["lastStderr", "lastError"]],
    ["error", (state) => applyPiError(state, "failed"), ["lastError"]],
    ["select", extension("select", { options: ["A"] }), ["extensionRequestQueue"]],
    ["confirm", extension("confirm"), ["extensionRequestQueue"]],
    ["input", extension("input"), ["extensionRequestQueue"]],
    ["editor", extension("editor", { prefill: "new text" }), ["extensionRequestQueue", "extensionEditorText"]],
    ["duplicate dialog", extension("input", { id: "req-1" }), []],
    ["notification", extension("notify", { message: "new message" }), ["extensionNotifications"]],
    ["status", extension("setStatus", { statusKey: "sync", statusText: "done" }), ["extensionStatuses"]],
    ["remove status", extension("setStatus", { statusKey: "sync" }), ["extensionStatuses"]],
    ["widget", extension("setWidget", { widgetKey: "review", widgetLines: ["new line"] }), ["extensionWidgets"]],
    ["remove widget", extension("setWidget", { widgetKey: "review" }), ["extensionWidgets"]],
    ["title", extension("setTitle", { title: "new title" }), ["extensionTitle"]],
    ["editor text", extension("set_editor_text", { text: "new text" }), ["extensionEditorText"]],
    ["invalid extension", extension("invalid"), []],
    ["clear dialog", (state) => clearActiveExtensionRequest(state, "req-1"), ["extensionRequestQueue", "activeExtensionRequest"]],
  ])("%s 只替换修改字段，保留其他引用且不修改冻结的旧状态", (_name, update, changedKeys) => {
    const state = createPopulatedState();
    const snapshot = structuredClone(state);
    freezeState(state);
    const next = update(state);

    expect(next).not.toBe(state);
    expect(state).toEqual(snapshot);
    for (const key of Object.keys(state) as (keyof PiConversationState)[]) {
      if (changedKeys.includes(key)) expect(next[key], key).not.toBe(state[key]);
      else expect(next[key], key).toBe(state[key]);
    }
  });

  it("从空状态分叉的会话不会互相污染，也不会修改共享默认值", () => {
    const snapshot = structuredClone(EMPTY_PI_CONVERSATION_STATE);
    const first = applyPiExtensionUiRequest(undefined, { type: "extension_ui_request", id: "status", method: "setStatus", statusKey: "sync", statusText: "running" });
    const second = trackPendingPiCommand(undefined, "cmd-1");
    const updated = extension("setWidget", { widgetKey: "review", widgetLines: ["line"] })(first);

    expect(second.extensionStatuses).toEqual({});
    expect(first.pendingCommandIds).toEqual([]);
    expect(first.extensionWidgets).toEqual({});
    expect(updated.extensionWidgets.review.lines).toEqual(["line"]);
    expect(EMPTY_PI_CONVERSATION_STATE).toEqual(snapshot);
  });

  it("projects model and thinking metadata from RPC responses", () => {
    let state = applyPiRpcResponse(undefined, { type: "response", command: "get_state", success: true, data: { model: { id: "model-a", provider: "provider-a", name: "Model A", reasoning: true, contextWindow: 1_000_000 }, thinkingLevel: "medium" } });
    state = applyPiRpcResponse(state, { type: "response", command: "get_available_models", success: true, data: { models: [{ id: "model-a", provider: "provider-a" }, { id: "model-b", provider: "provider-b" }, { provider: "invalid" }] } });
    state = applyPiRpcResponse(state, { type: "response", command: "get_available_thinking_levels", success: true, data: { levels: ["off", "low", "high", 1] } });

    expect(state.model).toMatchObject({ id: "model-a", provider: "provider-a", name: "Model A", contextWindow: 1_000_000 });
    expect(state.thinkingLevel).toBe("medium");
    expect(state.contextUsage).toEqual({ tokens: 0, contextWindow: 1_000_000, percent: 0 });
    expect(state.availableModels).toHaveLength(2);
    expect(state.availableThinkingLevels).toEqual(["off", "low", "high"]);
  });

  it("projects current context usage from session statistics", () => {
    const state = applyPiRpcResponse(undefined, {
      type: "response",
      command: "get_session_stats",
      success: true,
      data: { contextUsage: { tokens: 60_000, contextWindow: 200_000, percent: 30 } },
    });

    expect(state.contextUsage).toEqual({ tokens: 60_000, contextWindow: 200_000, percent: 30 });
  });

  it("keeps the model window as zero usage when session statistics omit context usage", () => {
    let state = applyPiRpcResponse(undefined, {
      type: "response",
      command: "get_state",
      success: true,
      data: { model: { id: "model-a", provider: "provider-a", contextWindow: 1_000_000 } },
    });
    state = applyPiRpcResponse(state, { type: "response", command: "get_session_stats", success: true, data: {} });

    expect(state.contextUsage).toEqual({ tokens: 0, contextWindow: 1_000_000, percent: 0 });
  });

  it("keeps previous conversation metadata while exposing RPC failures", () => {
    const state = applyPiRpcResponse({ ...EMPTY_PI_CONVERSATION_STATE, thinkingLevel: "low" }, { type: "response", command: "set_thinking_level", success: false, error: "模型不可用" });
    expect(state.thinkingLevel).toBe("low");
    expect(state.lastError).toBe("set_thinking_level: 模型不可用");
  });

  it("tracks pending commands and clears them when settled", () => {
    const pending = trackPendingPiCommand(undefined, "cmd-1");
    const settled = settlePendingPiCommand(pending, "cmd-1");

    expect(pending.pendingCommandIds).toEqual(["cmd-1"]);
    expect(settled.pendingCommandIds).toEqual([]);
  });

  it("captures stderr as visible error state", () => {
    const state = applyPiProcessStderr(undefined, "auth failed");
    expect(state.lastStderr).toBe("auth failed");
    expect(state.lastError).toBe("auth failed");
  });

  it("captures non-stderr Pi errors without overwriting stderr state", () => {
    const state = applyPiError({ ...EMPTY_PI_CONVERSATION_STATE, lastStderr: "previous stderr" }, "gateway failed");
    expect(state.lastError).toBe("gateway failed");
    expect(state.lastStderr).toBe("previous stderr");
  });

  it("stores extension ui requests and updates notify/status/widget/title/editor state", () => {
    let state = applyPiExtensionUiRequest(undefined, { type: "extension_ui_request", id: "req-1", method: "input", title: "请输入" });
    state = applyPiExtensionUiRequest(state, { type: "extension_ui_request", id: "req-2", method: "confirm", title: "确认", message: "继续？" });
    state = applyPiExtensionUiRequest(state, { type: "extension_ui_request", id: "note-1", method: "notify", message: "已连接", notifyType: "info" });
    state = applyPiExtensionUiRequest(state, { type: "extension_ui_request", id: "status-1", method: "setStatus", statusKey: "sync", statusText: "同步中" });
    state = applyPiExtensionUiRequest(state, { type: "extension_ui_request", id: "widget-1", method: "setWidget", widgetKey: "review", widgetLines: ["A", "B"], widgetPlacement: "aboveEditor" });
    state = applyPiExtensionUiRequest(state, { type: "extension_ui_request", id: "title-1", method: "setTitle", title: "扩展标题" });
    state = applyPiExtensionUiRequest(state, { type: "extension_ui_request", id: "editor-1", method: "set_editor_text", text: "编辑器内容" });

    expect(state.activeExtensionRequest).toMatchObject({ id: "req-1", method: "input", title: "请输入" });
    expect(state.extensionRequestQueue.map((request) => request.id)).toEqual(["req-1", "req-2"]);
    expect(state.extensionNotifications).toEqual([{ id: "note-1", message: "已连接", notifyType: "info" }]);
    expect(state.extensionStatuses).toEqual({ sync: "同步中" });
    expect(state.extensionWidgets.review).toEqual({ key: "review", lines: ["A", "B"], placement: "aboveEditor" });
    expect(state.extensionTitle).toBe("扩展标题");
    expect(state.extensionEditorText).toBe("编辑器内容");
    const nextRequest = clearActiveExtensionRequest(state, "req-1");
    expect(nextRequest.activeExtensionRequest?.id).toBe("req-2");
    expect(clearActiveExtensionRequest(nextRequest, "req-2").activeExtensionRequest).toBeNull();
  });
});

function createPopulatedState(): PiConversationState {
  const request = { type: "extension_ui_request", id: "req-1", method: "input", title: "Input" } as const;
  return {
    ...EMPTY_PI_CONVERSATION_STATE,
    model: { id: "model-a", provider: "test" },
    thinkingLevel: "low",
    contextUsage: { tokens: 1, contextWindow: 100, percent: 1 },
    availableModels: [{ id: "model-a", provider: "test" }],
    availableThinkingLevels: ["low"],
    pendingCommandIds: ["cmd-1"],
    lastError: "previous error",
    activeExtensionRequest: request,
    extensionRequestQueue: [request],
    extensionNotifications: [{ id: "note-1", message: "ready", notifyType: "info" }],
    extensionStatuses: { sync: "running" },
    extensionWidgets: { review: { key: "review", lines: ["line"], placement: "aboveEditor" } },
  };
}

describe("applyPiGoalEvent", () => {
  it("从 pi-goal 自定义消息提取目标与状态", () => {
    const state = applyPiGoalEvent(undefined, {
      role: "custom",
      customType: "pi-goal-event",
      details: { kind: "active", goal: { objective: "完善插件", status: "active" } },
    });
    expect(state.goal).toEqual({ objective: "完善插件", status: "active" });
  });

  it("cleared 事件清除已有目标", () => {
    const state = applyPiGoalEvent(
      { ...EMPTY_PI_CONVERSATION_STATE, goal: { objective: "完善插件", status: "active" } },
      { details: { kind: "cleared", goal: { objective: "完善插件", status: "active" } } },
    );
    expect(state.goal).toBeNull();
  });

  it("缺少目标字段时清空目标", () => {
    const state = applyPiGoalEvent(undefined, { role: "custom", customType: "pi-goal-event", details: { kind: "active" } });
    expect(state.goal).toBeNull();
  });
});

function freezeState(value: object) {
  Object.values(value).forEach((child) => {
    if (child && typeof child === "object") freezeState(child);
  });
  Object.freeze(value);
}
