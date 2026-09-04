import { describe, expect, it } from "vitest";
import {
  applyPiError,
  applyPiExtensionUiRequest,
  applyPiProcessStderr,
  applyPiRpcResponse,
  clearActiveExtensionRequest,
  EMPTY_PI_CONVERSATION_STATE,
  settlePendingPiCommand,
  trackPendingPiCommand,
} from "@/lib/pi-runtime-state";

describe("Pi runtime state", () => {
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
