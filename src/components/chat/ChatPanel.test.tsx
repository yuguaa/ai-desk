// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getConversationTurnFingerprint } from "@/lib/conversation-changes";
import { MessageResponse } from "@/components/ai-elements/message";
import { Reasoning } from "@/components/ai-elements/reasoning";
import { Tool } from "@/components/ai-elements/tool";
import type { TimelineItem } from "@/lib/pi-session";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

vi.mock("@/components/ai-elements/prompt-input", () => ({
  PromptInput: ({ isRunning, onSubmit }: { isRunning?: boolean; onSubmit: () => void }) => <div data-slot="prompt-input" data-running={isRunning ? "true" : "false"} onClick={onSubmit} />,
}));

vi.mock("@/components/ai-elements/message", { spy: true });
vi.mock("@/components/ai-elements/reasoning", { spy: true });
vi.mock("@/components/ai-elements/tool", { spy: true });

import { ChatPanel } from "@/components/chat/ChatPanel";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

const defaultProps: ComponentProps<typeof ChatPanel> = {
  conversationId: "session-1",
  canSend: true,
  timeline: [],
  draft: "",
  isBusy: false,
  turnChanges: {},
  models: [],
  selectedModel: null,
  thinkingLevel: null,
  thinkingLevels: [],
  contextUsage: null,
  runtimeAvailable: false,
  activeExtensionRequest: null,
  extensionNotifications: [],
  extensionStatuses: [],
  extensionWidgets: [],
  onModelChange: () => undefined,
  onThinkingChange: () => undefined,
  onDraftChange: () => undefined,
  onSend: () => undefined,
  onAbort: () => undefined,
  onViewChanges: () => undefined,
  onRefreshChanges: () => undefined,
  onPreviewChange: () => undefined,
  onRevertChange: () => Promise.resolve(false),
  onRespondToExtensionUi: () => undefined,
};

function renderChatPanel(props: Partial<ComponentProps<typeof ChatPanel>>) {
  root?.render(<ChatPanel {...defaultProps} {...props} />);
}

beforeAll(() => import("@/components/chat/TimelineItemView"));

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.clearAllMocks();
});

describe("ChatPanel", () => {
  it.each(["纯图", "读取中", "模型未就绪", "模型不支持", "无项目", "会话加载中"])("sendMessage 自身校验附件发送条件：%s", async (scenario) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const onSend = vi.fn();
    await act(() => renderChatPanel({
      images: [{ id: "image-1", name: "图片.png", type: "image", data: "aGVsbG8=", mimeType: "image/png" }],
      selectedModel: scenario === "模型未就绪" ? null : { id: "model", name: "Model", provider: "provider", reasoning: false, contextWindow: 200_000, input: scenario === "模型不支持" ? ["text"] : ["text", "image"] },
      draft: "", onSend,
      attachmentsLoading: scenario === "读取中",
      canSend: scenario !== "无项目",
      isTimelineLoading: scenario === "会话加载中",
    }));
    /* 跳过输入框的禁用按钮，验证 ChatPanel 不依赖子组件防护。 */
    await act(() => container!.querySelector<HTMLElement>('[data-slot="prompt-input"]')!.click());
    expect(onSend).toHaveBeenCalledTimes(scenario === "纯图" ? 1 : 0);
  });

  it.each([false, true])("加载时隐藏旧消息和空态且不扫描时间线（空时间线：%s）", async (empty) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const timeline: TimelineItem[] = empty ? [] : [{ id: "assistant-old", type: "assistant", text: "旧会话消息", time: "现在" }];

    await act(async () => {
      renderChatPanel({ timeline });
      await import("@/components/chat/TimelineItemView");
    });
    expect(container.textContent).toContain(empty ? "开始一个新对话" : "旧会话消息");

    const readTimeline = vi.fn((_target: TimelineItem[], property: string | symbol): never => {
      throw new Error(`加载时不应读取时间线：${String(property)}`);
    });
    await act(async () => {
      renderChatPanel({ timeline: new Proxy(timeline, { get: readTimeline }), isTimelineLoading: true, isBusy: true });
    });

    const status = container.querySelector('[role="status"][aria-label="加载会话中"]');
    expect(status?.textContent).toBe("加载会话中…");
    expect(status?.querySelector("svg")).not.toBeNull();
    expect(status?.className).toContain("items-center");
    expect(status?.className).toContain("justify-center");
    expect(container.textContent).not.toContain("旧会话消息");
    expect(container.textContent).not.toContain("开始一个新对话");
    expect(container.querySelector('[data-slot="conversation-scroll-viewport"]')).toBeNull();
    expect(container.querySelector('[data-slot="conversation-status"]')).toBeNull();
    expect(container.querySelector('.timeline-item')).toBeNull();
    expect(container.querySelector('[data-slot="prompt-input"]')).not.toBeNull();
    expect(readTimeline).not.toHaveBeenCalled();
  });

  it("加载时阻止发送，完成后显示消息并恢复发送", async () => {
    const onSend = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const props = { draft: "继续处理", onSend };

    await act(async () => {
      renderChatPanel({ ...props, isTimelineLoading: true });
    });
    const promptInput = container.querySelector<HTMLElement>('[data-slot="prompt-input"]');
    expect(promptInput).not.toBeNull();
    await act(async () => {
      promptInput?.click();
    });
    expect(onSend).not.toHaveBeenCalled();

    await act(async () => {
      renderChatPanel({
        ...props,
        isTimelineLoading: false,
        timeline: [{ id: "assistant-new", type: "assistant", text: "当前会话消息", time: "现在" }],
      });
    });

    expect(container.querySelector('[role="status"][aria-label="加载会话中"]')).toBeNull();
    expect(container.querySelector('.timeline-item')?.textContent).toContain("当前会话消息");
    expect(container.querySelector('[data-slot="conversation-scroll-viewport"]')).not.toBeNull();
    expect(container.textContent).not.toContain("开始一个新对话");
    expect(container.querySelector('[data-slot="prompt-input"]')).toBe(promptInput);
    await act(async () => {
      promptInput?.click();
    });
    expect(onSend).toHaveBeenCalledOnce();
  });

  it("流式重建当前消息块时只渲染变化的正文，且不读写滚动布局", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const history: TimelineItem[] = Array.from({ length: 20 }, (_, index) => [
      { id: `user-${index}`, type: "user" as const, text: `问题 ${index}`, time: "现在" },
      { id: `answer-${index}`, type: "assistant" as const, text: `回答 ${index}`, time: "现在" },
    ]).flat();
    const blocks: TimelineItem[] = [
      { id: "thinking", type: "reasoning", text: "分析", status: "running" },
      { id: "tool", type: "tool", name: "bash", command: "pwd", output: "/demo", status: "completed" },
      { id: "prefix", type: "assistant", text: "固定段落", time: "正在生成", streaming: true },
    ];
    const renderToken = (token: number) => renderChatPanel({
      isBusy: true,
      timeline: [...history, ...blocks.map((item) => ({ ...item })),
        { id: "stream", type: "assistant", text: `输出 ${token}`, time: "正在生成", streaming: true }],
    });
    await act(async () => { renderToken(0); });
    const viewport = container.querySelector<HTMLElement>('[data-slot="conversation-scroll-viewport"]')!;
    const readLayout = vi.fn(() => 0);
    const writeScroll = vi.fn();
    Object.defineProperties(viewport, {
      scrollHeight: { configurable: true, get: readLayout },
      clientHeight: { configurable: true, get: readLayout },
      scrollTop: { configurable: true, get: readLayout, set: writeScroll },
    });
    vi.clearAllMocks();
    for (let token = 1; token <= 20; token += 1) {
      await act(async () => { renderToken(token); });
    }
    expect(container.textContent).toContain("输出 20");
    expect(vi.mocked(MessageResponse).mock.calls.map(([props]) => props.children)).toEqual(
      Array.from({ length: 20 }, (_, index) => `输出 ${index + 1}`),
    );
    expect(vi.mocked(Reasoning)).not.toHaveBeenCalled();
    expect(vi.mocked(Tool)).not.toHaveBeenCalled();
    expect(readLayout).not.toHaveBeenCalled();
    expect(writeScroll).not.toHaveBeenCalled();
  });

  it("运行中只通过输入框停止按钮指示", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderChatPanel({
        timeline: [{ id: "user-1", type: "user", text: "修改当前页面", time: "现在" }],
        isBusy: true,
        turnChanges: {
          0: {
            cwd: "/demo",
            conversationId: "session-1",
            turnIndex: 0,
            promptFingerprint: getConversationTurnFingerprint("修改当前页面"),
            baselineTree: "tree-0",
            endTree: null,
            phase: "running",
            status: null,
          },
        },
        runtimeAvailable: true,
      });
      await Promise.resolve();
    });

    const promptInput = container.querySelector('[data-slot="prompt-input"][data-running="true"]');
    const conversationStatus = container.querySelector<HTMLElement>('[data-slot="conversation-status"]');
    expect(container.firstElementChild?.className).toContain("bg-[var(--bg-workspace)]");
    expect(promptInput?.closest('[data-slot="conversation-composer"]')).not.toBeNull();
    expect(conversationStatus?.className).toContain("items-center");
    expect(conversationStatus?.className).toContain("leading-none");
    expect(container.querySelector('[data-slot="conversation-changes"][data-phase="running"]')).toBeNull();
    expect(container.textContent).not.toContain("就绪");
  });

  it("回合结束后在最后一条回复下方展示变更横幅", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderChatPanel({
        timeline: [
          { id: "user-1", type: "user", text: "修改当前页面", time: "现在" },
          { id: "assistant-1", type: "assistant", text: "已经完成修改", time: "现在" },
        ],
        turnChanges: {
          0: {
            cwd: "/demo",
            conversationId: "session-1",
            turnIndex: 0,
            promptFingerprint: getConversationTurnFingerprint("修改当前页面"),
            baselineTree: "tree-0",
            endTree: "tree-1",
            phase: "completed",
            status: { branch: "main", clean: false, additions: 4, deletions: 1, files: [{ path: "src/App.tsx", code: "M" }] },
          },
        },
      });
      await Promise.resolve();
    });

    const timelineItems = container.querySelectorAll('.timeline-item');
    const completedBanner = container.querySelector('[data-slot="conversation-changes"][data-layout="banner"]');
    const lastTimelineItem = timelineItems.item(timelineItems.length - 1).querySelector("article")!;
    expect(completedBanner?.closest('[data-slot="conversation-content"]')).not.toBeNull();
    expect(completedBanner?.textContent).toContain("本次执行修改了 1 个文件");
    expect(lastTimelineItem.compareDocumentPosition(completedBanner as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("回合结束插入变更横幅时保持回答位置不动", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const timeline: ComponentProps<typeof ChatPanel>["timeline"] = [
      { id: "user-1", type: "user", text: "修改当前页面", time: "现在" },
      { id: "assistant-1", type: "assistant", text: "已经完成修改", time: "现在" },
    ];
    const runningChange = {
      cwd: "/demo",
      conversationId: "session-1",
      turnIndex: 0,
      promptFingerprint: getConversationTurnFingerprint("修改当前页面"),
      baselineTree: "tree-0",
      endTree: null,
      phase: "running" as const,
      status: null,
    };

    await act(async () => {
      renderChatPanel({ timeline, isBusy: true, turnChanges: { 0: runningChange } });
      await Promise.resolve();
    });

    const viewport = container.querySelector<HTMLElement>('[data-slot="conversation-scroll-viewport"]');
    let scrollHeight = 900;
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, get: () => scrollHeight },
      scrollTop: { configurable: true, writable: true, value: 0 },
    });

    await act(async () => {
      viewport?.dispatchEvent(new Event("scroll"));
    });

    scrollHeight = 952;
    await act(async () => {
      renderChatPanel({
        timeline,
        isBusy: false,
        turnChanges: {
          0: {
            ...runningChange,
            endTree: "tree-1",
            phase: "completed",
            status: { branch: "main", clean: false, additions: 4, deletions: 1, files: [{ path: "src/App.tsx", code: "M" }] },
          },
        },
      });
      await Promise.resolve();
    });

    expect(viewport?.scrollTop).toBe(0);
    expect(container.querySelector('[data-slot="conversation-changes"]')).not.toBeNull();
  });

  it("完成但缺失结束快照时显示统计失败而不是零变更", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      renderChatPanel({
        timeline: [{ id: "user", type: "user", text: "修改页面", time: "现在" }],
        turnChanges: {
          0: {
            cwd: "/demo", conversationId: "session-1", turnIndex: 0,
            promptFingerprint: getConversationTurnFingerprint("修改页面"),
            baselineTree: "tree-0", endTree: null, phase: "completed", status: null,
          },
        },
      });
    });
    expect(container.querySelector('[data-slot="conversation-changes"][role="alert"]')?.textContent).toContain("统计失败");
    expect(container.textContent).not.toContain("本次执行未修改文件");
  });

  it("发送有效对话时滚动到底部", async () => {
    const onSend = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderChatPanel({
        timeline: [{ id: "assistant-1", type: "assistant", text: "较长的历史回复", time: "现在" }],
        draft: "继续处理",
        onSend,
      });
      await Promise.resolve();
    });

    const viewport = container.querySelector<HTMLElement>('[data-slot="conversation-scroll-viewport"]');
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 900 },
      scrollTop: { configurable: true, writable: true, value: -200 },
    });

    await act(async () => {
      viewport?.dispatchEvent(new Event("scroll"));
      container?.querySelector<HTMLElement>('[data-slot="prompt-input"]')?.click();
    });

    expect(onSend).toHaveBeenCalledOnce();
    expect(viewport?.scrollTop).toBe(0);
    expect(container.querySelector('button[aria-label="滚动到底部"]')).toBeNull();
  });

  it("切换会话时重建反向滚动视口并回到底部", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderChatPanel({ conversationId: "session-a", timeline: [{ id: "assistant-a", type: "assistant", text: "会话 A", time: "现在" }] });
      await Promise.resolve();
    });

    const previousViewport = container.querySelector<HTMLElement>('[data-slot="conversation-scroll-viewport"]');
    Object.defineProperty(previousViewport, "scrollTop", { configurable: true, writable: true, value: -200 });

    await act(async () => {
      renderChatPanel({ conversationId: "session-b", timeline: [{ id: "assistant-b", type: "assistant", text: "会话 B", time: "现在" }] });
      await Promise.resolve();
    });

    const nextViewport = container.querySelector<HTMLElement>('[data-slot="conversation-scroll-viewport"]');
    expect(nextViewport).not.toBe(previousViewport);
    expect(nextViewport?.scrollTop).toBe(0);
  });
});
