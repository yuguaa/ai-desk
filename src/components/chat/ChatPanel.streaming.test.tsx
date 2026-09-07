// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { useEditor } from "@tiptap/react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("@tiptap/react", { spy: true });

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeAll(() => Promise.all([
  import("@/components/ai-elements/prompt-input"),
  import("@/components/chat/TimelineItemView"),
]));

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.clearAllMocks();
});

function createProps(): ComponentProps<typeof ChatPanel> {
  return {
    conversationId: "streaming-session", timeline: [], draft: "继续处理", isBusy: true,
    turnChanges: {}, models: [], selectedModel: null, thinkingLevel: null,
    thinkingLevels: [], contextUsage: null, runtimeAvailable: true,
    activeExtensionRequest: null, extensionNotifications: [], extensionStatuses: [], extensionWidgets: [],
    onModelChange: vi.fn(), onThinkingChange: vi.fn(), onDraftChange: vi.fn(),
    onSend: vi.fn(), onAbort: vi.fn(), onViewChanges: vi.fn(), onRefreshChanges: vi.fn(),
    onPreviewChange: vi.fn(), onRevertChange: vi.fn(), onRespondToExtensionUi: vi.fn(),
  };
}

function renderPanel(props: ComponentProps<typeof ChatPanel>) {
  root?.render(<TooltipProvider><ChatPanel {...props} /></TooltipProvider>);
}

describe("ChatPanel 流式输入框隔离", () => {
  it("20 次正文增量不重新执行输入框的 Tiptap 配置", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const props = createProps();
    const renderToken = (token: number) => renderPanel({
      ...props,
      /* 实际工作区会重建空队列及回调，不能依赖这些引用稳定。 */
      queuedTurns: [],
      onAbort: () => props.onAbort(),
      onModelChange: (key) => props.onModelChange(key),
      timeline: [
        { id: "user", type: "user", text: "问题", time: "现在" },
        { id: "answer", type: "assistant", text: `输出 ${token}`, time: "现在", streaming: true },
      ],
    });
    await act(() => renderToken(0));
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("继续处理");
    vi.mocked(useEditor).mockClear();

    for (let token = 1; token <= 20; token += 1) {
      await act(() => renderToken(token));
    }

    expect(container.textContent).toContain("输出 20");
    expect(useEditor).not.toHaveBeenCalled();
  });

  it("草稿、加载状态和发送回调更新后使用最新值", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const props = createProps();
    const onSend = vi.fn();
    await act(() => renderPanel(props));
    await act(() => renderPanel({ ...props, draft: "新草稿", onSend, isTimelineLoading: true }));
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("新草稿");
    await act(() => container?.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(onSend).not.toHaveBeenCalled();

    await act(() => renderPanel({ ...props, draft: "新草稿", onSend, isBusy: false }));
    expect(container.querySelector('button[aria-label="发送任务"]')).not.toBeNull();
    await act(() => container?.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(onSend).toHaveBeenCalledOnce();
    expect(props.onSend).not.toHaveBeenCalled();

    await act(() => renderPanel({ ...props, draft: "", onSend }));
    await act(() => container?.querySelector<HTMLButtonElement>('button[aria-label="中止任务"]')?.click());
    expect(props.onAbort).toHaveBeenCalledOnce();
    expect(onSend).toHaveBeenCalledOnce();
  });

  it("编辑器跳过渲染后，Enter 和输入事件仍访问最新回调", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const props = createProps();
    const onSend = vi.fn();
    const onDraftChange = vi.fn();
    await act(() => renderPanel(props));
    const editor = vi.mocked(useEditor).mock.results.slice().reverse().find((result) => result.type === "return" && result.value)?.value;
    expect(editor).toBeTruthy();
    const textbox = container.querySelector<HTMLElement>(".ProseMirror");
    vi.mocked(useEditor).mockClear();

    await act(() => renderPanel({
      ...props, onSend, onDraftChange,
      selectedModel: { id: "new-model", name: "New Model", provider: "provider", reasoning: false, contextWindow: 200_000 },
      contextUsage: { tokens: 60_000, contextWindow: 200_000, percent: 30 },
    }));
    expect(container.querySelector('button[aria-label="选择模型，当前 New Model"]')).not.toBeNull();
    expect(container.querySelector('[data-progress="30"]')).not.toBeNull();
    expect(container.querySelector(".ProseMirror")).toBe(textbox);
    expect(useEditor).not.toHaveBeenCalled();

    await act(() => textbox?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    expect(onSend).toHaveBeenCalledOnce();
    expect(props.onSend).not.toHaveBeenCalled();
    await act(() => { editor?.commands.insertContent("补充"); });
    expect(onDraftChange).toHaveBeenCalledWith(expect.stringContaining("补充"));
    expect(props.onDraftChange).not.toHaveBeenCalled();
  });
});
