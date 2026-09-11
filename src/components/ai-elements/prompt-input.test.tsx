// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PromptInput as PromptInputBase } from "@/components/ai-elements/prompt-input";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Attachment } from "@/lib/attachments";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

// jsdom 缺少 ResizeObserver，radix TooltipContent 需要
Reflect.set(globalThis, "ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

// jsdom 缺少 getClientRects，Tiptap 滚动定位需要（元素、文本节点与 Range 都会调用）
const emptyRectList = [] as unknown as DOMRectList;
const emptyRect = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
Element.prototype.getClientRects = function getClientRects() {
  return emptyRectList;
};
(Text.prototype as unknown as { getClientRects: () => DOMRectList }).getClientRects = function getClientRects() {
  return emptyRectList;
};
Range.prototype.getClientRects = function getClientRects() {
  return emptyRectList;
};
Range.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return emptyRect;
};

// 包装 TooltipProvider：radix Tooltip 必须在 Provider 内使用
function PromptInput(props: ComponentProps<typeof PromptInputBase>) {
  return <TooltipProvider delayDuration={0}><PromptInputBase {...props} /></TooltipProvider>;
}

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  document.querySelectorAll('[data-slot="tooltip-content"]').forEach((item) => item.remove());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe("PromptInput", () => {
  const attachments: Attachment[] = [{ id: "image-1", name: "截图.png", type: "image", data: "aGVsbG8=", mimeType: "image/png" }];
  function renderInput(props: Partial<ComponentProps<typeof PromptInputBase>> = {}) {
    if (!container) {
      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);
    }
    return act(() => { root?.render(<PromptInput value="" onChange={() => undefined} onSubmit={() => undefined} {...props} />); });
  }

  it("纯图支持按钮和 Enter 发送，运行中加入队列而不中止", async () => {
    const onSubmit = vi.fn();
    const onAbort = vi.fn();
    await renderInput({ attachments, onSubmit, onAbort });
    expect(container!.querySelector<HTMLButtonElement>('[aria-label="发送任务"]')!.disabled).toBe(false);
    await act(() => container!.querySelector<HTMLButtonElement>('[aria-label="发送任务"]')!.click());
    await renderInput({ attachments, onSubmit, onAbort, isRunning: true });
    expect(container!.querySelector('[aria-label="中止任务"]')).toBeNull();
    await act(() => { container!.querySelector('.ProseMirror')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onAbort).not.toHaveBeenCalled();
  });

  it("读入图片时禁止按钮、表单和 Enter 提交，仍可编辑和移除", async () => {
    const onSubmit = vi.fn();
    const onRemoveAttachment = vi.fn();
    await renderInput({ value: "继续编辑", attachments, attachmentsLoading: true, onSubmit, onRemoveAttachment });
    expect(container!.querySelector<HTMLButtonElement>('[aria-label="发送任务"]')!.disabled).toBe(true);
    expect(container!.querySelector('.ProseMirror')!.getAttribute('contenteditable')).toBe('true');
    expect(container!.querySelector('[role="status"]')!.textContent).toContain('正在读取附件');
    await act(() => {
      container!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      container!.querySelector('.ProseMirror')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      container!.querySelector<HTMLButtonElement>('[aria-label="移除附件：截图.png"]')!.click();
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onRemoveAttachment).toHaveBeenCalledWith('image-1');
    await renderInput({ attachments, onSubmit });
    expect(container!.querySelector<HTMLButtonElement>('[aria-label="发送任务"]')!.disabled).toBe(false);
  });

  it("选择、粘贴和拖入文件统一回调，不写入编辑器 HTML", async () => {
    const onAddFiles = vi.fn();
    const file = new File(['image'], '图片.png', { type: 'image/png' });
    await renderInput({ onAddFiles });
    const input = container!.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.accept).toBe('');
    expect(input.multiple).toBe(true);
    Object.defineProperty(input, 'files', { value: [file] });
    await act(() => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    for (const kind of ['paste', 'drop']) {
      const event = new Event(kind, { bubbles: true, cancelable: true });
      Object.defineProperty(event, kind === 'paste' ? 'clipboardData' : 'dataTransfer', { value: { files: [file], types: ['Files'], getData: () => '<img src="x">' } });
      await act(() => { container!.querySelector('.ProseMirror')!.dispatchEvent(event); });
      expect(event.defaultPrevented).toBe(true);
    }
    expect(onAddFiles).toHaveBeenCalledTimes(3);
    expect(onAddFiles).toHaveBeenLastCalledWith([file]);
    expect(container!.querySelector('.ProseMirror img')).toBeNull();
  });

  it("普通文本粘贴保留，附件按钮始终展示", async () => {
    const onChange = vi.fn();
    const onAddFiles = vi.fn();
    await renderInput({ onChange, onAddFiles });
    expect(container!.querySelector('[aria-label="添加附件"]')).not.toBeNull();
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { files: [], types: ['text/plain'], getData: (type: string) => type === 'text/plain' ? '普通文本' : '' } });
    await act(() => { container!.querySelector('.ProseMirror')!.dispatchEvent(paste); });
    expect(onChange).toHaveBeenCalledWith('普通文本');
    expect(onAddFiles).not.toHaveBeenCalled();
    await act(() => container!.querySelector<HTMLButtonElement>('[aria-label="添加附件"]')!.click());
    expect(onAddFiles).not.toHaveBeenCalled();
  });

  it("纯图队列任务展示数量和缩略图", async () => {
    await renderInput({ queuedTurns: [{ id: 'q-image', conversationId: 'c1', prompt: '', createdAt: 1, attachments }] });
    const queue = container!.querySelector('[data-slot="conversation-queue"]')!;
    expect(queue.textContent).toContain('1 个附件');
    expect(queue.querySelector('img')!.alt).toBe('截图.png');
  });

  it("把模型和思考深度放在 Tiptap 输入框内部", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<PromptInput value="检查这个项目" onChange={() => undefined} onSubmit={() => undefined} models={[{ id: "model-a", provider: "provider-a", name: "Model A" }]} selectedModel={{ id: "model-a", provider: "provider-a", name: "Model A" }} thinkingLevel="medium" thinkingLevels={["off", "medium", "high"]} onModelChange={() => undefined} onThinkingChange={() => undefined} />);
    });

    expect(container.querySelector(".ProseMirror")?.getAttribute("contenteditable")).toBe("true");
    expect(container.querySelector(".ProseMirror")?.getAttribute("aria-label")).toBe("随心输入，Enter 发送，Shift + Enter 换行");
    expect(container.textContent).not.toContain("开放访问");
    const modelTrigger = container.querySelector('button[data-slot="dropdown-menu-trigger"][aria-label="选择模型，当前 Model A"]');
    const thinkingTrigger = container.querySelector('button[data-slot="dropdown-menu-trigger"][aria-label="选择思考深度，当前 中等"]');
    expect(modelTrigger?.textContent).toContain("Model A");
    expect(thinkingTrigger?.textContent).toContain("中等");
    expect(modelTrigger?.closest('[data-slot="prompt-toolbar"]')).not.toBeNull();
    expect(thinkingTrigger?.closest('[data-slot="prompt-toolbar"]')).not.toBeNull();
    expect(container.querySelectorAll('button[data-slot="select-trigger"]')).toHaveLength(0);
  });

  it("空输入时禁用发送按钮", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<PromptInput value="" onChange={() => undefined} onSubmit={() => undefined} />);
    });

    const placeholder = container.querySelector('[data-slot="prompt-placeholder"]');
    expect(placeholder?.textContent).toBe("随心输入");
    expect(placeholder?.className).toContain("text-[var(--text-disabled)]");
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="发送任务"]')?.disabled).toBe(true);
  });

  it("在输入框内部的发送按钮旁展示上下文使用情况", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<PromptInput value="" onChange={() => undefined} onSubmit={() => undefined} contextUsage={{ tokens: 60_000, contextWindow: 200_000, percent: 30 }} />);
    });

    const form = container.querySelector("form");
    const usage = container.querySelector('[data-slot="context-usage"]');
    const submit = container.querySelector('button[aria-label="发送任务"]');
    // 上下文展示为进度环（conic-gradient 圆环，带进度值）
    expect(usage?.querySelector("span[data-progress]")?.getAttribute("data-progress")).toBe("30");
    expect(usage?.closest("form")).toBe(form);
    expect(Boolean(usage && submit && (usage.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);

    // 鼠标放上去展示文本（通过聚焦触发，jsdom 下与真实 hover 同路）
    await act(async () => {
      (usage as HTMLElement)?.focus();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.querySelector('[data-slot="tooltip-content"]')?.textContent).toContain("60K/200K");
    expect(document.querySelector('[data-slot="tooltip-content"]')?.textContent).toContain("30%");
  });

  it("按 Enter 发送任务", async () => {
    const onSubmit = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<PromptInput value="检查这个项目" onChange={() => undefined} onSubmit={onSubmit} />);
    });

    await act(async () => {
      container?.querySelector(".ProseMirror")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });

    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it.each(["", "  \n  "])("空白草稿不通过键盘或表单发送：%j", async (value) => {
    const onSubmit = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(() => root?.render(<PromptInput value={value} onChange={() => undefined} onSubmit={onSubmit} />));

    await act(() => {
      container?.querySelector(".ProseMirror")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      container?.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="发送任务"]')?.disabled).toBe(true);
  });

  it("按 Shift + Enter 只换行，不发送任务", async () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<PromptInput value="检查这个项目" onChange={onChange} onSubmit={onSubmit} />);
    });

    await act(async () => {
      container?.querySelector(".ProseMirror")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true }));
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0]).toContain("\n");
  });

  it("禁止提交时键盘和表单均不发送，仍可中止运行中的任务", async () => {
    const onSubmit = vi.fn();
    const onAbort = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const props = { onChange: vi.fn(), onSubmit, onAbort, submitDisabled: true, isRunning: true };
    await act(() => root?.render(<PromptInput {...props} value="待发送草稿" />));
    await act(() => {
      container?.querySelector(".ProseMirror")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      container?.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onAbort).not.toHaveBeenCalled();

    await act(() => root?.render(<PromptInput {...props} value="" />));
    const abortButton = container.querySelector<HTMLButtonElement>('button[aria-label="中止任务"]');
    expect(abortButton?.disabled).toBe(false);
    await act(() => abortButton?.click());
    expect(onAbort).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each([{ isComposing: true }, { keyCode: 229 }])("输入法确认候选词时不发送任务：%j", async (composition) => {
    const onSubmit = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<PromptInput value="检查这个项目" onChange={() => undefined} onSubmit={onSubmit} />);
    });

    await act(async () => {
      container?.querySelector(".ProseMirror")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ...composition, bubbles: true, cancelable: true }));
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("运行中根据输入内容在同一位置切换发送和中止按钮", async () => {
    const onSubmit = vi.fn();
    const onAbort = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<PromptInput value="正在执行" onChange={() => undefined} onSubmit={onSubmit} onAbort={onAbort} isRunning />);
    });

    expect(container.querySelector('button[aria-label="中止任务"]')).toBeNull();
    expect(container.querySelector('button[aria-label="加入后续队列"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="发送任务"]')).toBeNull();
    await act(async () => {
      container?.querySelector(".ProseMirror")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onAbort).not.toHaveBeenCalled();

    await act(async () => {
      root?.render(<PromptInput value="" onChange={() => undefined} onSubmit={onSubmit} onAbort={onAbort} isRunning />);
    });
    expect(container.querySelector('button[aria-label="加入后续队列"]')).toBeNull();
    expect(container.querySelector('button[aria-label="中止任务"] .lucide-square')).not.toBeNull();
    await act(async () => {
      container?.querySelector<HTMLButtonElement>('button[aria-label="中止任务"]')?.click();
    });
    expect(onAbort).toHaveBeenCalledOnce();
    expect(onAbort).toHaveBeenLastCalledWith();
    expect(container.querySelector('[aria-label="排队模式"]')).toBeNull();
  });

  it("展示待执行队列，并支持编辑、引导、键盘调整顺序和移除", async () => {
    const onReorderQueuedTurn = vi.fn();
    const onRemoveQueuedTurn = vi.fn();
    const onSteerQueuedTurn = vi.fn();
    const onEditQueuedTurn = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<PromptInput
        value=""
        onChange={() => undefined}
        onSubmit={() => undefined}
        queuedTurns={[
          { id: "q1", conversationId: "c1", prompt: "任务一", createdAt: 1 },
          { id: "q2", conversationId: "c1", prompt: "任务二", createdAt: 2 },
        ]}
        onReorderQueuedTurn={onReorderQueuedTurn}
        onRemoveQueuedTurn={onRemoveQueuedTurn}
        onSteerQueuedTurn={onSteerQueuedTurn}
        onEditQueuedTurn={onEditQueuedTurn}
      />);
    });

    expect(container.querySelector('[data-slot="conversation-queue"]')?.textContent).toContain("任务一");
    expect(container.querySelector('[data-slot="conversation-queue"]')?.textContent).toContain("任务二");
    expect(container.querySelector('[data-slot="conversation-queue"]')?.textContent).not.toContain("引导中");

    await act(async () => {
      container!.querySelector<HTMLButtonElement>('button[aria-label="编辑队列任务：任务二"]')?.click();
    });
    expect(onEditQueuedTurn).toHaveBeenCalledWith("q2");

    await act(async () => {
      container!.querySelector<HTMLButtonElement>('button[aria-label="引导队列任务：任务一"]')?.click();
    });
    expect(onSteerQueuedTurn).toHaveBeenCalledWith("q1");

    await act(async () => {
      container!.querySelector<HTMLButtonElement>('button[aria-label="调整队列任务：任务二"]')?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    });
    expect(onReorderQueuedTurn).toHaveBeenCalledWith("q2", "q1");

    await act(async () => {
      container!.querySelector<HTMLButtonElement>('button[aria-label="移除队列任务：任务一"]')?.click();
    });
    expect(onRemoveQueuedTurn).toHaveBeenCalledWith("q1");
  });

  it("编辑中的队列项保留位置并锁定冲突操作", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<PromptInput
        value="任务二"
        onChange={() => undefined}
        onSubmit={() => undefined}
        editingQueuedTurnId="q2"
        queuedTurns={[
          { id: "q1", conversationId: "c1", prompt: "任务一", createdAt: 1 },
          { id: "q2", conversationId: "c1", prompt: "任务二", createdAt: 2 },
        ]}
      />);
    });

    expect(container.querySelector('[data-queue-id="q2"]')?.getAttribute("data-editing")).toBe("true");
    expect(container.querySelector('button[aria-label="保存队列任务"]')).not.toBeNull();
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="正在编辑队列任务：任务二"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="引导队列任务：任务二"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="移除队列任务：任务二"]')?.disabled).toBe(true);
  });

  it("拖动队列项时提交新的排序位置", async () => {
    const onReorderQueuedTurn = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<PromptInput
        value=""
        onChange={() => undefined}
        onSubmit={() => undefined}
        queuedTurns={[
          { id: "q1", conversationId: "c1", prompt: "任务一", createdAt: 1 },
          { id: "q2", conversationId: "c1", prompt: "任务二", createdAt: 2 },
        ]}
        onReorderQueuedTurn={onReorderQueuedTurn}
      />);
    });

    let draggedId = "";
    const dataTransfer = {
      effectAllowed: "none",
      setData: (_type: string, value: string) => { draggedId = value; },
      getData: () => draggedId,
    };
    const dragStart = new Event("dragstart", { bubbles: true, cancelable: true });
    Object.defineProperty(dragStart, "dataTransfer", { value: dataTransfer });
    const dragOver = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperty(dragOver, "dataTransfer", { value: dataTransfer });
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: dataTransfer });

    await act(async () => {
      container!.querySelector<HTMLButtonElement>('button[aria-label="调整队列任务：任务二"]')?.dispatchEvent(dragStart);
    });
    await act(async () => {
      container!.querySelector<HTMLElement>('[data-queue-id="q1"]')?.dispatchEvent(dragOver);
    });
    await act(async () => {
      container!.querySelector<HTMLElement>('[data-queue-id="q1"]')?.dispatchEvent(drop);
    });

    expect(onReorderQueuedTurn).toHaveBeenCalledWith("q2", "q1");
  });

  describe("斜杠命令菜单", () => {
    function pasteText(text: string) {
      const paste = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(paste, "clipboardData", { value: { files: [], types: ["text/plain"], getData: () => text } });
      return act(async () => { container!.querySelector(".ProseMirror")!.dispatchEvent(paste); });
    }

    it("输入 / 弹出内置与 pi 动态命令提示", async () => {
      const onChange = vi.fn();
      await renderInput({
        onChange,
        slashCommands: [
          { name: "goal", description: "长跑目标", source: "extension" },
          { name: "skill:vue", description: "Vue 技能", source: "skill" },
        ],
      });
      await pasteText("/");

      const menu = container!.querySelector('[data-slot="slash-command-menu"]');
      expect(menu).not.toBeNull();
      expect(menu!.textContent).toContain("/new");
      expect(menu!.textContent).toContain("/goal");
      expect(menu!.textContent).toContain("/skill:vue");
      expect(menu!.textContent).toContain("开始新会话");
      expect(onChange).toHaveBeenLastCalledWith("/");
    });

    it("按查询词过滤命令，Esc 关闭菜单", async () => {
      await renderInput({
        slashCommands: [{ name: "goal", description: "长跑目标", source: "extension" }],
      });
      await pasteText("/co");
      const menu = container!.querySelector('[data-slot="slash-command-menu"]');
      expect(menu!.textContent).toContain("/compact");
      expect(menu!.textContent).not.toContain("/goal");

      await act(async () => {
        container!.querySelector(".ProseMirror")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      expect(container!.querySelector('[data-slot="slash-command-menu"]')).toBeNull();
    });

    it("上下键导航，Enter 插入命令文本并关闭菜单", async () => {
      const onChange = vi.fn();
      await renderInput({
        onChange,
        slashCommands: [{ name: "goal", description: "长跑目标", source: "extension" }],
      });
      await pasteText("/");
      const editor = container!.querySelector(".ProseMirror")!;

      /* 下移一次选到第二项 /name，回车插入并保留编辑器焦点继续输入参数 */
      await act(async () => {
        editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });

      expect(onChange).toHaveBeenLastCalledWith("/name ");
      expect(container!.querySelector('[data-slot="slash-command-menu"]')).toBeNull();
      /* 菜单已关闭，再次 Enter 走正常发送路径 */
      const onSubmit = vi.fn();
      await renderInput({ value: "/name ", onSubmit });
      await act(async () => {
        container!.querySelector(".ProseMirror")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      expect(onSubmit).toHaveBeenCalled();
    });

    it("命令名后输入参数时隐藏菜单", async () => {
      await renderInput();
      await pasteText("/name arg");
      expect(container!.querySelector('[data-slot="slash-command-menu"]')).toBeNull();
    });

    it("点击菜单项插入命令文本", async () => {
      const onChange = vi.fn();
      await renderInput({ onChange, slashCommands: [{ name: "goal", description: "长跑目标", source: "extension" }] });
      await pasteText("/");

      const goalItem = Array.from(container!.querySelectorAll<HTMLButtonElement>("[role='option']")).find((button) => button.textContent?.includes("/goal"))!;
      await act(async () => goalItem.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true })));

      expect(onChange).toHaveBeenLastCalledWith("/goal ");
      expect(container!.querySelector('[data-slot="slash-command-menu"]')).toBeNull();
    });

    it("选择无参数命令 /new 后菜单保持关闭，再次 Enter 不重开菜单", async () => {
      const onSubmit = vi.fn();
      await renderInput({ onSubmit });
      await pasteText("/");
      const editor = container!.querySelector(".ProseMirror")!;

      await act(async () => {
        editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      expect(container!.querySelector('[data-slot="slash-command-menu"]')).toBeNull();

      /* 菜单已关闭，/new 随草稿走正常提交路径 */
      await renderInput({ value: "/new", onSubmit });
      await act(async () => {
        container!.querySelector(".ProseMirror")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      expect(container!.querySelector('[data-slot="slash-command-menu"]')).toBeNull();
      expect(onSubmit).toHaveBeenCalledOnce();
    });

    it("无匹配命令时 Enter 放行正常提交", async () => {
      const onSubmit = vi.fn();
      await renderInput({ value: "/foo", onSubmit });
      await pasteText("/foo");
      await act(async () => {
        container!.querySelector(".ProseMirror")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      expect(onSubmit).toHaveBeenCalledOnce();
    });

    it("中文输入法组合确认的 Enter 不触发菜单插入", async () => {
      const onChange = vi.fn();
      await renderInput({ onChange, slashCommands: [{ name: "goal", description: "长跑目标", source: "extension" }] });
      await pasteText("/");

      const composing = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
      Object.defineProperty(composing, "isComposing", { value: true });
      await act(async () => {
        container!.querySelector(".ProseMirror")!.dispatchEvent(composing);
      });

      /* 组合确认不插入任何命令文本 */
      expect(onChange.mock.calls.flat().every((text) => !text.startsWith("/new") && !text.startsWith("/name ") && !text.startsWith("/goal "))).toBe(true);
    });

    it("编辑器失焦时关闭菜单", async () => {
      await renderInput();
      await pasteText("/");
      expect(container!.querySelector('[data-slot="slash-command-menu"]')).not.toBeNull();

      await act(async () => {
        container!.querySelector(".ProseMirror")!.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      });
      expect(container!.querySelector('[data-slot="slash-command-menu"]')).toBeNull();
    });

    it("菜单打开时回调 onSlashMenuOpen 用于补拉 pi 动态命令", async () => {
      const onSlashMenuOpen = vi.fn();
      await renderInput({ onSlashMenuOpen });
      await pasteText("/");
      expect(onSlashMenuOpen).toHaveBeenCalledOnce();

      /* 菜单已打开，继续输入查询词不重复回调 */
      await pasteText("n");
      expect(onSlashMenuOpen).toHaveBeenCalledOnce();
    });
  });
});
