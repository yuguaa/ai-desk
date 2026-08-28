// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PromptInput } from "@/components/ai-elements/prompt-input";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe("PromptInput", () => {
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
    expect(modelTrigger?.closest(".relative.min-h-\\[116px\\]")).not.toBeNull();
    expect(thinkingTrigger?.closest(".relative.min-h-\\[116px\\]")).not.toBeNull();
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
    expect(usage?.textContent).toBe("上下文 60K/200K · 30%");
    expect(usage?.closest("form")).toBe(form);
    expect(Boolean(usage && submit && (usage.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
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

  it("输入法组词期间按 Enter 不发送任务", async () => {
    const onSubmit = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<PromptInput value="检查这个项目" onChange={() => undefined} onSubmit={onSubmit} />);
    });

    await act(async () => {
      container?.querySelector(".ProseMirror")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true }));
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
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: dataTransfer });

    await act(async () => {
      container!.querySelector<HTMLButtonElement>('button[aria-label="调整队列任务：任务二"]')?.dispatchEvent(dragStart);
      container!.querySelector<HTMLElement>('[data-queue-id="q1"]')?.dispatchEvent(drop);
    });

    expect(onReorderQueuedTurn).toHaveBeenCalledWith("q2", "q1");
  });
});
