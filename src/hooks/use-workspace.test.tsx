// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  runtime: true,
  projects: [
    {
      id: "/workspace/demo",
      name: "demo",
      path: "/workspace/demo",
      conversations: [
        { id: "c1", title: "会话一", preview: "", time: "刚刚", sessionFile: "/tmp/c1.jsonl", modifiedAt: "3", messageCount: 1 },
        { id: "c2", title: "会话二", preview: "", time: "刚刚", sessionFile: "/tmp/c2.jsonl", modifiedAt: "2", messageCount: 1 },
      ],
    },
  ],
  session: null as { activeEntries: Record<string, unknown>[] } | null,
  renamePiSession: vi.fn(() => Promise.resolve()),
}));

const runtime = vi.hoisted(() => {
  let nextId = 0;
  return {
    processList: [] as { conversationId: string; pid: number; running: boolean; busy: boolean }[],
    onEvent: undefined as ((payload: { conversationId: string; event: Record<string, unknown> }) => void) | undefined,
    onExit: undefined as ((payload: { conversationId: string; code?: number }) => void) | undefined,
    createPiCommandId: vi.fn(() => `cmd-${++nextId}`),
    listPiProcesses: vi.fn(() => Promise.resolve(runtime.processList)),
    listenPiRuntime: vi.fn((onEvent, onExit) => {
      runtime.onEvent = onEvent;
      runtime.onExit = onExit;
      return Promise.resolve(() => undefined);
    }),
    sendPiCommand: vi.fn(() => Promise.resolve()),
    startPiProcess: vi.fn((conversationId: string) => Promise.resolve({ conversationId, pid: 100 + Number(conversationId.slice(-1) || 0), running: true, busy: false })),
    stopPiProcess: vi.fn(() => Promise.resolve()),
    reset() {
      nextId = 0;
      runtime.processList = [];
      runtime.onEvent = undefined;
      runtime.onExit = undefined;
      runtime.createPiCommandId.mockClear();
      runtime.listPiProcesses.mockClear();
      runtime.listenPiRuntime.mockClear();
      runtime.sendPiCommand.mockClear();
      runtime.startPiProcess.mockClear();
      runtime.stopPiProcess.mockClear();
    },
  };
});

vi.mock("@/lib/pi-bridge", () => ({
  isTauriRuntime: () => bridge.runtime,
  listPiProjects: () => Promise.resolve(bridge.projects),
  readPiSession: () => Promise.resolve(bridge.session),
  renamePiSession: bridge.renamePiSession,
}));

vi.mock("@/lib/pi-runtime", () => ({
  createPiCommandId: runtime.createPiCommandId,
  listPiProcesses: runtime.listPiProcesses,
  listenPiRuntime: runtime.listenPiRuntime,
  sendPiCommand: runtime.sendPiCommand,
  startPiProcess: runtime.startPiProcess,
  stopPiProcess: runtime.stopPiProcess,
}));

import { useWorkspace } from "@/hooks/use-workspace";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let workspace: ReturnType<typeof useWorkspace> | undefined;

beforeEach(() => {
  localStorage.clear();
  bridge.runtime = true;
  bridge.session = null;
  bridge.renamePiSession.mockClear();
  bridge.projects = [{
    id: "/workspace/demo",
    name: "demo",
    path: "/workspace/demo",
    conversations: [
      { id: "c1", title: "会话一", preview: "", time: "刚刚", sessionFile: "/tmp/c1.jsonl", modifiedAt: "3", messageCount: 1 },
      { id: "c2", title: "会话二", preview: "", time: "刚刚", sessionFile: "/tmp/c2.jsonl", modifiedAt: "2", messageCount: 1 },
    ],
  }];
  runtime.reset();
});

afterEach(() => {
  vi.useRealTimers();
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  workspace = undefined;
});

describe("useWorkspace", () => {
  it("仅从 AI Desk 展示中移除项目，并在刷新后保持隐藏", async () => {
    bridge.projects = [
      ...bridge.projects,
      {
        id: "/workspace/other",
        name: "other",
        path: "/workspace/other",
        conversations: [{ id: "c3", title: "其他项目会话", preview: "", time: "刚刚", sessionFile: "/tmp/c3.jsonl", modifiedAt: "1", messageCount: 1 }],
      },
    ];
    await mountWorkspace();
    runtime.stopPiProcess.mockClear();

    await act(async () => {
      await workspace?.removeProject("/workspace/demo");
    });

    expect(runtime.stopPiProcess).toHaveBeenCalledWith("c1");
    expect(workspace?.projects.map((project) => project.id)).toEqual(["/workspace/other"]);
    expect(workspace?.conversations.map((conversation) => conversation.id)).toEqual(["c3"]);
    expect(workspace?.activeProject.id).toBe("/workspace/other");
    expect(JSON.parse(localStorage.getItem("ai-desk.workspace") ?? "{}").hiddenProjectRoots).toEqual(["/workspace/demo"]);
    expect(bridge.projects.some((project) => project.path === "/workspace/demo")).toBe(true);

    await act(async () => {
      await workspace?.refreshProjects();
    });
    expect(workspace?.projects.map((project) => project.id)).toEqual(["/workspace/other"]);
  });

  it("持久化置顶顺序，并在会话文件重命名成功后更新标题", async () => {
    await mountWorkspace();
    runtime.sendPiCommand.mockClear();

    act(() => workspace?.setConversationPinned("c2", true));
    expect(workspace?.conversations.map((conversation) => conversation.id)).toEqual(["c2", "c1"]);
    expect(JSON.parse(localStorage.getItem("ai-desk.workspace") ?? "{}").pinnedConversationIds).toEqual(["c2"]);

    await act(async () => {
      await workspace?.renameConversation("c1", "新的会话名称");
    });

    expect(bridge.renamePiSession).toHaveBeenCalledWith("/tmp/c1.jsonl", "新的会话名称");
    const runtimeCommands = runtime.sendPiCommand.mock.calls as unknown as Array<[string, { type: string }]>;
    expect(runtimeCommands.some(([, command]) => command.type === "set_session_name")).toBe(false);
    expect(workspace?.conversations.find((conversation) => conversation.id === "c1")?.title).toBe("新的会话名称");
  });

  it("按 contentIndex 投影 streaming assistant 消息，不把 thinking 混入正文", async () => {
    await mountWorkspace();

    emitEvent("c1", { type: "message_start", message: { id: "m-1", role: "assistant" } });
    emitEvent("c1", { type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 2, delta: "最终正文" } });
    emitEvent("c1", { type: "message_update", assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "分析步骤" } });
    emitEvent("c1", { type: "message_update", assistantMessageEvent: { type: "toolcall_start", contentIndex: 1, id: "tool-1", toolName: "bash" } });
    emitEvent("c1", { type: "message_update", assistantMessageEvent: { type: "toolcall_end", contentIndex: 1, toolCall: { id: "tool-1", name: "bash", arguments: "ls" } } });
    emitEvent("c1", { type: "tool_execution_end", toolCallId: "tool-1", toolName: "bash", result: { content: [{ text: "done" }] } });
    emitEvent("c1", {
      type: "message_end",
      message: {
        id: "m-1",
        role: "assistant",
        content: [
          { type: "thinking", thinking: "分析步骤" },
          { type: "toolCall", id: "tool-1", name: "bash", arguments: "ls" },
          { type: "text", text: "最终正文" },
        ],
      },
    });

    expect(workspace?.timeline.map((item) => item.type)).toEqual(["reasoning", "tool", "assistant"]);
    expect(workspace?.timeline.find((item) => item.type === "assistant")).toMatchObject({ text: "最终正文" });
    expect(workspace?.timeline.find((item) => item.type === "reasoning")).toMatchObject({ text: "分析步骤", status: "completed" });
    expect(workspace?.timeline.find((item) => item.type === "tool")).toMatchObject({ command: "ls", output: "done", status: "completed" });
  });

  it("agent settled 后只刷新项目元数据，不覆盖活动时间线", async () => {
    await mountWorkspace();

    emitEvent("c1", { type: "message_start", message: { id: "m-1", role: "assistant" } });
    emitEvent("c1", { type: "message_update", assistantMessageEvent: { type: "toolcall_start", contentIndex: 0, id: "tool-1", toolName: "bash" } });
    emitEvent("c1", { type: "message_update", assistantMessageEvent: { type: "toolcall_end", contentIndex: 0, toolCall: { id: "tool-1", name: "bash", arguments: "ls" } } });
    emitEvent("c1", { type: "tool_execution_end", toolCallId: "tool-1", toolName: "bash", result: { content: [{ text: "done" }] } });
    emitEvent("c1", {
      type: "message_end",
      message: {
        id: "m-1",
        role: "assistant",
        content: [
          { type: "toolCall", id: "tool-1", name: "bash", arguments: "ls" },
          { type: "text", text: "最终正文" },
        ],
      },
    });

    const liveItemIds = workspace?.timeline.map((item) => item.id);
    bridge.session = {
      activeEntries: [
        {
          type: "message",
          id: "disk-message-1",
          timestamp: "2026-08-31T08:00:00.000Z",
          message: {
            role: "assistant",
            content: [
              { type: "toolCall", id: "tool-1", name: "bash", arguments: "ls" },
              { type: "text", text: "最终正文" },
            ],
          },
        },
        {
          type: "message",
          id: "disk-tool-result-1",
          timestamp: "2026-08-31T08:00:01.000Z",
          message: { role: "toolResult", toolCallId: "tool-1", toolName: "bash", content: [{ type: "text", text: "done" }] },
        },
      ],
    };

    await act(async () => {
      emitEvent("c1", { type: "agent_settled" });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(workspace?.timeline.map((item) => item.id)).toEqual(liveItemIds);
  });

  it("仅在 abort 成功响应后清除 busy，并把 RPC 失败暴露到时间线", async () => {
    runtime.processList = [{ conversationId: "c1", pid: 101, running: true, busy: true }];
    await mountWorkspace();
    runtime.sendPiCommand.mockClear();

    act(() => workspace?.abortConversation("c1"));
    const abortCommand = lastCommand();

    expect(workspace?.processes.c1?.busy).toBe(true);
    emitEvent("c1", { type: "response", id: abortCommand.command.id, command: "abort", success: false, error: "拒绝中止" });
    expect(workspace?.processes.c1?.busy).toBe(true);
    expect(workspace?.conversationState.lastError).toBe("abort: 拒绝中止");
    expect(workspace?.timeline.at(-1)).toMatchObject({ type: "assistant", text: "abort: 拒绝中止" });

    runtime.sendPiCommand.mockClear();
    act(() => workspace?.abortConversation("c1"));
    const successAbortCommand = lastCommand();
    emitEvent("c1", { type: "response", id: successAbortCommand.command.id, command: "abort", success: true, data: {} });

    expect(workspace?.processes.c1?.busy).toBe(false);
  });

  it("停止当前任务时保留并暂停待执行队列，settled 后不再续发", async () => {
    runtime.processList = [{ conversationId: "c1", pid: 101, running: true, busy: true }];
    await mountWorkspace();

    act(() => workspace?.setDraft("队列任务一"));
    act(() => workspace?.sendMessage());
    act(() => workspace?.setDraft("队列任务二"));
    act(() => workspace?.sendMessage());
    expect(workspace?.queuedTurns.map((turn) => turn.prompt)).toEqual(["队列任务一", "队列任务二"]);

    runtime.sendPiCommand.mockClear();
    act(() => workspace?.abortConversation("c1"));
    expect(workspace?.queuedTurns.map((turn) => turn.prompt)).toEqual(["队列任务一", "队列任务二"]);
    expect(hasSentCommand("abort")).toBe(true);

    emitEvent("c1", { type: "agent_settled" });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(hasSentCommand("prompt")).toBe(false);
    expect(hasSentCommand("steer")).toBe(false);

    act(() => workspace?.setDraft("队列任务三"));
    act(() => workspace?.sendMessage());
    expect(workspace?.queuedTurns.map((turn) => turn.prompt)).toEqual(["队列任务一", "队列任务二", "队列任务三"]);
    expect(hasSentCommand("prompt")).toBe(false);
  });

  it("准备阶段停止任务后不再发送延迟完成的 prompt", async () => {
    await mountWorkspace();
    runtime.sendPiCommand.mockClear();
    let releasePreparation: (() => void) | undefined;
    const beforeRun = () => new Promise<void>((resolve) => { releasePreparation = resolve; });

    act(() => workspace?.setDraft("等待准备完成"));
    act(() => workspace?.sendMessage(beforeRun));
    expect(workspace?.activeTurnIndexes.c1).toBe(0);

    act(() => workspace?.abortConversation("c1"));
    expect(hasSentCommand("abort")).toBe(true);

    await act(async () => {
      releasePreparation?.();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(hasSentCommand("prompt")).toBe(false);
  });

  it("支持 extension_ui_request，并在 trust 切换时重启空闲进程", async () => {
    runtime.processList = [{ conversationId: "c1", pid: 101, running: true, busy: false }];
    await mountWorkspace();
    runtime.sendPiCommand.mockClear();
    runtime.startPiProcess.mockClear();
    runtime.stopPiProcess.mockClear();

    emitEvent("c1", { type: "extension_ui_request", id: "ext-1", method: "input", title: "请输入说明", placeholder: "说明" });
    expect(workspace?.activeExtensionRequest).toMatchObject({ id: "ext-1", method: "input", title: "请输入说明" });

    await act(async () => {
      await workspace?.respondToExtensionUi({ id: "ext-1", value: "已确认" });
    });

    expect(lastCommand()).toEqual({ conversationId: "c1", command: { type: "extension_ui_response", id: "ext-1", value: "已确认" } });
    expect(workspace?.activeExtensionRequest).toBeNull();

    let trustPromise: Promise<void> | undefined;
    await act(async () => {
      trustPromise = workspace?.setActiveProjectTrusted(true);
      await Promise.resolve();
      await Promise.resolve();
    });

    ["get_state", "get_available_models", "get_available_thinking_levels", "get_session_stats"].forEach((commandType) => {
      const command = findLastCommand(commandType);
      emitEvent("c1", { type: "response", id: command.command.id, command: commandType, success: true, data: {} });
    });

    await act(async () => {
      await trustPromise;
    });

    expect(workspace?.activeProjectTrusted).toBe(true);
    expect(runtime.stopPiProcess).toHaveBeenCalledWith("c1");
    expect(runtime.startPiProcess).toHaveBeenCalledWith("c1", "/workspace/demo", "/tmp/c1.jsonl", true);
  });

  it("切换会话时停止上一空闲进程，但保留 busy 会话并行", async () => {
    runtime.processList = [{ conversationId: "c1", pid: 101, running: true, busy: false }];
    await mountWorkspace();
    runtime.stopPiProcess.mockClear();
    runtime.startPiProcess.mockClear();

    act(() => workspace?.selectConversation(workspace!.conversations.find((conversation) => conversation.id === "c2")!));
    expect(runtime.stopPiProcess).toHaveBeenCalledWith("c1");
    expect(runtime.startPiProcess).toHaveBeenCalledWith("c2", "/workspace/demo", "/tmp/c2.jsonl", false);

    runtime.stopPiProcess.mockClear();
    emitEvent("c1", { type: "agent_start" });
    act(() => workspace?.selectConversation(workspace!.conversations.find((conversation) => conversation.id === "c1")!));
    act(() => workspace?.selectConversation(workspace!.conversations.find((conversation) => conversation.id === "c2")!));
    expect(runtime.stopPiProcess).not.toHaveBeenCalledWith("c1");
  });

  it("输入草稿按会话隔离，并在切换回来时恢复", async () => {
    await mountWorkspace();

    act(() => workspace?.setDraft("会话一草稿"));
    act(() => workspace?.selectConversation(workspace!.conversations.find((conversation) => conversation.id === "c2")!));
    expect(workspace?.draft).toBe("");

    act(() => workspace?.setDraft("会话二草稿"));
    act(() => workspace?.selectConversation(workspace!.conversations.find((conversation) => conversation.id === "c1")!));
    expect(workspace?.draft).toBe("会话一草稿");

    act(() => workspace?.selectConversation(workspace!.conversations.find((conversation) => conversation.id === "c2")!));
    expect(workspace?.draft).toBe("会话二草稿");
  });

  it("后台会话执行完成后标记待查看，点击会话后清除", async () => {
    runtime.processList = [{ conversationId: "c1", pid: 101, running: true, busy: true }];
    await mountWorkspace();

    act(() => workspace?.selectConversation(workspace!.conversations.find((conversation) => conversation.id === "c2")!));
    emitEvent("c1", { type: "agent_settled" });
    expect(workspace?.completedConversationIds).toContain("c1");

    act(() => workspace?.selectConversation(workspace!.conversations.find((conversation) => conversation.id === "c1")!));
    expect(workspace?.completedConversationIds).not.toContain("c1");
  });

  it("任务稳定结束后刷新当前上下文使用情况", async () => {
    runtime.processList = [{ conversationId: "c1", pid: 101, running: true, busy: true }];
    await mountWorkspace();
    runtime.sendPiCommand.mockClear();

    emitEvent("c1", { type: "agent_settled" });
    const statsCommand = findLastCommand("get_session_stats");
    emitEvent("c1", {
      type: "response",
      id: statsCommand.command.id,
      command: "get_session_stats",
      success: true,
      data: { contextUsage: { tokens: 60_000, contextWindow: 200_000, percent: 30 } },
    });

    expect(workspace?.conversationState.contextUsage).toEqual({ tokens: 60_000, contextWindow: 200_000, percent: 30 });
  });

  it("发送消息时先建立本回合基线，再把 prompt 交给运行时", async () => {
    await mountWorkspace();
    runtime.sendPiCommand.mockClear();
    let releaseBaseline: (() => void) | undefined;
    const beforeRun = vi.fn(() => new Promise<void>((resolve) => {
      releaseBaseline = resolve;
    }));

    act(() => workspace?.setDraft("修改当前页面"));
    act(() => workspace?.sendMessage(beforeRun));

    expect(beforeRun).toHaveBeenCalledWith({ conversationId: "c1", turnIndex: 0, prompt: "修改当前页面" });
    expect(workspace?.activeTurnIndexes.c1).toBe(0);
    expect(hasSentCommand("prompt")).toBe(false);

    await act(async () => releaseBaseline?.());
    expect(hasSentCommand("prompt")).toBe(true);

    emitEvent("c1", { type: "agent_settled" });
    expect(workspace?.activeTurnIndexes.c1).toBeUndefined();
  });

  it("运行中默认把消息加入 follow-up 队列，并在当前任务结束后按顺序执行", async () => {
    runtime.processList = [{ conversationId: "c1", pid: 101, running: true, busy: true }];
    await mountWorkspace();
    runtime.sendPiCommand.mockClear();
    const beforeRun = vi.fn(() => Promise.resolve());

    act(() => workspace?.setDraft("先检查测试"));
    act(() => workspace?.sendMessage(beforeRun));
    act(() => workspace?.setDraft("再更新文档"));
    act(() => workspace?.sendMessage(beforeRun));

    expect(workspace?.queuedTurns.map((turn) => turn.prompt)).toEqual(["先检查测试", "再更新文档"]);
    expect(beforeRun).not.toHaveBeenCalled();
    expect(hasSentCommand("prompt")).toBe(false);

    emitEvent("c1", { type: "agent_settled" });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(beforeRun).toHaveBeenCalledWith({ conversationId: "c1", turnIndex: 0, prompt: "先检查测试" });
    expect(findLastCommand("prompt").command).toMatchObject({ type: "prompt", message: "先检查测试" });
    expect(workspace?.queuedTurns.map((turn) => turn.prompt)).toEqual(["再更新文档"]);
  });

  it("运行中可把队首消息作为 steer 注入当前任务", async () => {
    runtime.processList = [{ conversationId: "c1", pid: 101, running: true, busy: true }];
    await mountWorkspace();
    runtime.sendPiCommand.mockClear();
    const beforeRun = vi.fn(() => Promise.resolve());

    act(() => workspace?.setDraft("改用另一种实现"));
    act(() => workspace?.sendMessage(beforeRun));
    const queuedTurn = workspace!.queuedTurns[0];
    act(() => workspace?.steerQueuedTurn(queuedTurn.id));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(beforeRun).toHaveBeenCalledWith({ conversationId: "c1", turnIndex: 0, prompt: "改用另一种实现" });
    expect(findLastCommand("steer").command).toMatchObject({ type: "steer", message: "改用另一种实现" });
    expect(workspace?.queuedTurns).toEqual([]);
  });

  it("连续点击引导会立即移出本地队列并发送 steer", async () => {
    runtime.processList = [{ conversationId: "c1", pid: 101, running: true, busy: true }];
    await mountWorkspace();
    runtime.sendPiCommand.mockClear();
    const beforeRun = vi.fn(() => Promise.resolve());

    act(() => workspace?.setDraft("引导一"));
    act(() => workspace?.sendMessage(beforeRun));
    const firstQueuedTurn = workspace!.queuedTurns[0];
    act(() => workspace?.steerQueuedTurn(firstQueuedTurn.id));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => workspace?.setDraft("引导二"));
    act(() => workspace?.sendMessage(beforeRun));
    const secondQueuedTurn = workspace!.queuedTurns[0];
    act(() => workspace?.steerQueuedTurn(secondQueuedTurn.id));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect((runtime.sendPiCommand.mock.calls as unknown as Array<[string, { type: string }]>).filter(([, command]) => command.type === "steer")).toHaveLength(2);
    expect(findLastCommand("steer").command).toMatchObject({ message: "引导二" });
    expect(workspace?.queuedTurns).toEqual([]);
  });

  it("首个任务仍在建立基线时不会提前发送 steer", async () => {
    await mountWorkspace();
    runtime.sendPiCommand.mockClear();
    let releaseBaseline: (() => void) | undefined;
    const beforeRun = vi.fn(() => new Promise<void>((resolve) => {
      releaseBaseline = resolve;
    }));

    act(() => workspace?.setDraft("原任务"));
    act(() => workspace?.sendMessage(beforeRun));
    act(() => workspace?.setDraft("引导任务"));
    act(() => workspace?.sendMessage(() => Promise.resolve()));
    const queuedTurn = workspace!.queuedTurns[0];
    act(() => workspace?.steerQueuedTurn(queuedTurn.id));

    expect(hasSentCommand("prompt")).toBe(false);
    expect(hasSentCommand("steer")).toBe(false);
    expect(workspace?.queuedTurns).toEqual([]);

    await act(async () => releaseBaseline?.());
    expect(hasSentCommand("prompt")).toBe(true);
    expect(hasSentCommand("steer")).toBe(false);

    emitEvent("c1", { type: "agent_start" });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(hasSentCommand("steer")).toBe(true);
  });

  it("支持重新排序和移除尚未执行的队列任务", async () => {
    runtime.processList = [{ conversationId: "c1", pid: 101, running: true, busy: true }];
    await mountWorkspace();

    for (const prompt of ["任务一", "任务二", "任务三"]) {
      act(() => workspace?.setDraft(prompt));
      act(() => workspace?.sendMessage());
    }

    const [first, second, third] = workspace!.queuedTurns;
    act(() => workspace?.reorderQueuedTurn(third.id, first.id));
    expect(workspace?.queuedTurns.map((turn) => turn.prompt)).toEqual(["任务三", "任务一", "任务二"]);

    act(() => workspace?.removeQueuedTurn(second.id));
    expect(workspace?.queuedTurns.map((turn) => turn.prompt)).toEqual(["任务三", "任务一"]);
  });

  it("编辑队列任务时回填输入框，并在发送后更新原位置", async () => {
    runtime.processList = [{ conversationId: "c1", pid: 101, running: true, busy: true }];
    await mountWorkspace();

    act(() => workspace?.setDraft("任务一"));
    act(() => workspace?.sendMessage());
    act(() => workspace?.setDraft("任务二"));
    act(() => workspace?.sendMessage());

    const originalTurns = workspace!.queuedTurns;
    act(() => workspace?.editQueuedTurn(originalTurns[1].id));
    expect(workspace?.draft).toBe("任务二");
    expect(workspace?.editingQueuedTurnId).toBe(originalTurns[1].id);

    act(() => workspace?.setDraft("任务二（已修改）"));
    act(() => workspace?.sendMessage());

    expect(workspace?.queuedTurns.map((turn) => [turn.id, turn.prompt])).toEqual([
      [originalTurns[0].id, "任务一"],
      [originalTurns[1].id, "任务二（已修改）"],
    ]);
    expect(workspace?.draft).toBe("");
    expect(workspace?.editingQueuedTurnId).toBeNull();
  });

  it("队首任务编辑期间暂停出队，保存后继续执行", async () => {
    runtime.processList = [{ conversationId: "c1", pid: 101, running: true, busy: true }];
    await mountWorkspace();
    runtime.sendPiCommand.mockClear();

    act(() => workspace?.setDraft("等待编辑"));
    act(() => workspace?.sendMessage(() => Promise.resolve()));
    const queuedTurn = workspace!.queuedTurns[0];
    act(() => workspace?.editQueuedTurn(queuedTurn.id));

    emitEvent("c1", { type: "agent_settled" });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(hasSentCommand("prompt")).toBe(false);

    act(() => workspace?.setDraft("保存后执行"));
    act(() => workspace?.sendMessage(() => Promise.resolve()));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(findLastCommand("prompt").command).toMatchObject({ message: "保存后执行" });
  });

  it("本回合基线建立失败时快速失败，不发送 prompt", async () => {
    await mountWorkspace();
    runtime.sendPiCommand.mockClear();
    const beforeRun = vi.fn(() => Promise.reject(new Error("无法建立 Git 基线")));

    act(() => workspace?.setDraft("修改当前页面"));
    act(() => workspace?.sendMessage(beforeRun));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(hasSentCommand("prompt")).toBe(false);
    expect(workspace?.activeTurnIndexes.c1).toBeUndefined();
    expect(workspace?.timeline.at(-1)).toMatchObject({ type: "assistant", text: "无法建立 Git 基线" });
  });

  it("RPC 长时间没有响应时清理 pending 并显示超时错误", async () => {
    await mountWorkspace();
    runtime.sendPiCommand.mockClear();
    vi.useFakeTimers();

    act(() => workspace?.abortConversation("c1"));
    const abortCommandId = lastCommand().command.id;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(workspace?.conversationState.pendingCommandIds).not.toContain(abortCommandId);
    expect(workspace?.timeline.at(-1)).toMatchObject({ type: "assistant", text: "abort 响应超时" });
  });
});

function WorkspaceHarness() {
  workspace = useWorkspace();
  return null;
}

function emitEvent(conversationId: string, event: Record<string, unknown>) {
  act(() => runtime.onEvent?.({ conversationId, event }));
}

function lastCommand() {
  const [conversationId, command] = runtime.sendPiCommand.mock.lastCall as unknown as [string, { id: string; type: string }];
  return { conversationId, command };
}

function findLastCommand(type: string) {
  const calls = runtime.sendPiCommand.mock.calls as unknown as Array<[string, { id: string; type: string }] >;
  const call = [...calls].reverse().find(([, command]) => command.type === type);
  if (!call) throw new Error(`missing command ${type}`);
  const conversationId = call[0];
  const command = call[1];
  return { conversationId, command };
}

function hasSentCommand(type: string) {
  const calls = runtime.sendPiCommand.mock.calls as unknown as Array<[string, { id: string; type: string }]>;
  return calls.some(([, command]) => command.type === type);
}

function mountWorkspace() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  return act(async () => {
    root?.render(<WorkspaceHarness />);
    await Promise.resolve();
    await Promise.resolve();
  });
}
