// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_APP_SETTINGS } from "@/lib/app-settings";
import { getConversationTurnFingerprint } from "@/lib/conversation-changes";

vi.mock("@/components/ai-elements/prompt-input", () => ({
  PromptInput: ({ isRunning, onSubmit }: { isRunning?: boolean; onSubmit: () => void }) => <div data-slot="prompt-input" data-running={isRunning ? "true" : "false"} onClick={onSubmit} />,
}));

vi.mock("@/components/chat/TimelineItemView", () => ({
  TimelineItemView: () => <div data-slot="timeline-item" />,
}));

import { ChatPanel } from "@/components/chat/ChatPanel";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

const defaultProps: ComponentProps<typeof ChatPanel> = {
  timeline: [],
  draft: "",
  isBusy: false,
  turnChanges: {},
  settings: { ...DEFAULT_APP_SETTINGS, mascotEnabled: false },
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
  onRespondToExtensionUi: () => undefined,
};

function renderChatPanel(props: Partial<ComponentProps<typeof ChatPanel>>) {
  root?.render(<ChatPanel {...defaultProps} {...props} />);
}

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe("ChatPanel", () => {
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
            phase: "running",
            status: null,
          },
        },
        runtimeAvailable: true,
      });
      await Promise.resolve();
    });

    const promptInput = container.querySelector('[data-slot="prompt-input"][data-running="true"]');
    expect(container.firstElementChild?.className).toContain("bg-[var(--bg-workspace)]");
    expect(promptInput?.closest('[data-slot="conversation-composer"]')).not.toBeNull();
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
            phase: "completed",
            status: { branch: "main", clean: false, additions: 4, deletions: 1, files: [{ path: "src/App.tsx", code: "M" }] },
          },
        },
      });
      await Promise.resolve();
    });

    const timelineItems = container.querySelectorAll('[data-slot="timeline-item"]');
    const completedBanner = container.querySelector('[data-slot="conversation-changes"][data-layout="banner"]');
    const lastTimelineItem = timelineItems.item(timelineItems.length - 1);
    expect(completedBanner?.closest('[data-slot="conversation-content"]')).not.toBeNull();
    expect(lastTimelineItem.compareDocumentPosition(completedBanner as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

    const viewport = container.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 900 },
      scrollTop: { configurable: true, writable: true, value: 200 },
    });

    await act(async () => {
      viewport?.dispatchEvent(new Event("scroll"));
      container?.querySelector<HTMLElement>('[data-slot="prompt-input"]')?.click();
    });

    expect(onSend).toHaveBeenCalledOnce();
    expect(viewport?.scrollTop).toBe(600);
    expect(container.querySelector('button[aria-label="滚动到底部"]')).toBeNull();
  });
});
