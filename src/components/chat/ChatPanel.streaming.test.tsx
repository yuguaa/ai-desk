// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditor } from "@tiptap/react";
import { toast } from "sonner";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ImageAttachment } from "@/lib/image-attachments";
import type { PiModel } from "@/lib/pi-runtime";

vi.mock("@tiptap/react", { spy: true });
vi.mock("sonner", () => ({ toast: { error: vi.fn() }, Toaster: () => null }));

const toastError = vi.mocked(toast.error);

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
    conversationId: "streaming-session", canSend: true, timeline: [], draft: "继续处理", isBusy: true,
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

describe("ChatPanel 图片发送链", () => {
  const images: ImageAttachment[] = [{ id: "image-1", name: "草稿.png", type: "image", data: "aGVsbG8=", mimeType: "image/png" }];
  const imageModel: PiModel = { id: "vision", name: "Vision", provider: "provider", reasoning: false, contextWindow: 200_000, input: ["text", "image"] };
  const textModel: PiModel = { ...imageModel, input: ["text"] };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  it.each([false, true])("纯图经按钮、Enter 和表单送达 onSend（运行中：%s）", async (isBusy) => {
    const props = { ...createProps(), images, selectedModel: imageModel, draft: "", isBusy };
    await act(() => renderPanel(props));
    const button = container!.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-label")).toBe(isBusy ? "加入后续队列" : "发送任务");
    await act(() => button.click());
    await act(() => { container!.querySelector(".ProseMirror")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    await act(() => { container!.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(props.onSend).toHaveBeenCalledTimes(3);
    expect(props.onAbort).not.toHaveBeenCalled();
  });

  it.each([
    { selectedModel: null, message: "模型信息未就绪" },
    { selectedModel: { ...imageModel, input: undefined }, message: "模型信息未就绪" },
    { selectedModel: textModel, message: "当前模型不支持图片" },
    { selectedModel: { ...imageModel, input: [] }, message: "当前模型不支持图片" },
  ])("含图时显示 $message，切换模型恢复同一份草稿", async ({ selectedModel, message }) => {
    const props = { ...createProps(), images, isBusy: false, selectedModel, draft: "说明图片" };
    await act(() => renderPanel(props));
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining(message));
    expect(container!.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    const editor = container!.querySelector(".ProseMirror")!;
    await act(() => {
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      container!.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(props.onSend).not.toHaveBeenCalled();
    expect(editor.getAttribute("contenteditable")).toBe("true");
    expect(container!.querySelector('img[alt="草稿.png"]')).not.toBeNull();
    await act(() => renderPanel({ ...props, selectedModel: imageModel }));
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(container!.querySelector(".ProseMirror")).toBe(editor);
    expect(editor.textContent).toBe("说明图片");
    await act(() => container!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    expect(props.onSend).toHaveBeenCalledOnce();
  });

  it("不支持图片仍可添加、移除和截图，并透传读入错误", async () => {
    const props = {
      ...createProps(), images, isBusy: false, selectedModel: textModel,
      onAddImages: vi.fn(), onRemoveImage: vi.fn(), onCaptureScreenshot: vi.fn(), attachmentError: "文件读取失败",
    };
    await act(() => renderPanel(props));
    const input = container!.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(["image"], "新图.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [file] });
    await act(() => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      container!.querySelector<HTMLButtonElement>('[aria-label="移除图片：草稿.png"]')!.click();
      container!.querySelector<HTMLButtonElement>('[aria-label="截图"]')!.click();
    });
    expect(props.onAddImages).toHaveBeenCalledWith([file]);
    expect(props.onRemoveImage).toHaveBeenCalledWith("image-1");
    expect(props.onCaptureScreenshot).toHaveBeenCalledOnce();
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining("文件读取失败"));
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining("不支持图片"));
    await act(() => renderPanel({ ...props, images: [] }));
    expect(toastError).toHaveBeenLastCalledWith("文件读取失败");
    expect(container!.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
    await act(() => container!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    expect(props.onSend).toHaveBeenCalledOnce();
  });

  it.each([null, textModel])("没有图片时不额外限制普通文本发送", async (selectedModel) => {
    const props = { ...createProps(), isBusy: false, selectedModel };
    await act(() => renderPanel(props));
    expect(toastError).not.toHaveBeenCalled();
    expect(container!.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
    await act(() => container!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    expect(props.onSend).toHaveBeenCalledOnce();
  });

  it("附件读取时阻止提交，读取结束后恢复纯图发送", async () => {
    const props = { ...createProps(), images, draft: "", selectedModel: imageModel, isBusy: false };
    await act(() => renderPanel({ ...props, attachmentsLoading: true }));
    expect(container!.querySelector('[role="status"]')!.textContent).toContain("正在读取图片");
    expect(container!.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    await act(() => { container!.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(props.onSend).not.toHaveBeenCalled();
    await act(() => renderPanel(props));
    await act(() => container!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    expect(props.onSend).toHaveBeenCalledOnce();
  });
});

describe("ChatPanel 流式输入框隔离", () => {
  it("无项目时禁止提交，选择项目后无需已有会话即可首次发送", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const props = { ...createProps(), conversationId: "", isBusy: false };
    await act(() => renderPanel({ ...props, canSend: false }));
    const textbox = container.querySelector<HTMLElement>(".ProseMirror");
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="发送任务"]');
    expect(button?.disabled).toBe(true);
    await act(() => {
      button?.click();
      textbox?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      container?.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(props.onSend).not.toHaveBeenCalled();
    expect(textbox?.textContent).toBe(props.draft);

    await act(() => renderPanel(props));
    expect(button?.disabled).toBe(false);
    expect(container.querySelector(".ProseMirror")).toBe(textbox);
    await act(() => button?.click());
    expect(props.onSend).toHaveBeenCalledOnce();
  });

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

  it.each([false, true])("加载会话时禁用发送但保留草稿，加载结束后恢复（运行中：%s）", async (isBusy) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const props = { ...createProps(), isBusy };
    await act(() => renderPanel({ ...props, isTimelineLoading: true }));
    const textbox = container.querySelector<HTMLElement>(".ProseMirror");
    const button = container.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(button?.disabled).toBe(true);
    expect(textbox?.getAttribute("contenteditable")).toBe("true");
    await act(() => {
      button?.click();
      textbox?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      container?.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(props.onSend).not.toHaveBeenCalled();
    expect(textbox?.textContent).toBe(props.draft);

    await act(() => renderPanel(props));
    expect(container.querySelector(".ProseMirror")).toBe(textbox);
    expect(button?.disabled).toBe(false);
    await act(() => button?.click());
    expect(props.onSend).toHaveBeenCalledOnce();
  });
});
