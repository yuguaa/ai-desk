// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import hljs from "highlight.js/lib/core";
import * as reactVirtual from "@tanstack/react-virtual";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiffPreview } from "@/components/files/DiffPreview";
import { FilePreview } from "@/components/files/FilePreview";

vi.mock("@tanstack/react-virtual", { spy: true });

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

let width = 800;
const heights = new Map<number, number>();
const observers = new Set<TestResizeObserver>();

/*
 * 只模拟浏览器布局数据和通知，范围计算、滚动监听和测量缓存均使用真实虚拟器。
 */
class TestResizeObserver {
  targets = new Set<Element>();
  constructor(private callback: ResizeObserverCallback) { observers.add(this); }
  observe(target: Element) { this.targets.add(target); }
  unobserve(target: Element) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); observers.delete(this); }
  static notify(target: HTMLElement, contentWidth = target.offsetWidth) {
    for (const observer of observers) {
      if (!observer.targets.has(target)) continue;
      observer.callback([{
        target,
        contentRect: { ...target.getBoundingClientRect(), width: contentWidth },
        borderBoxSize: [{ inlineSize: target.offsetWidth, blockSize: target.offsetHeight }],
        contentBoxSize: [{ inlineSize: target.offsetWidth, blockSize: target.offsetHeight }],
        devicePixelContentBoxSize: [],
      }], observer as unknown as ResizeObserver);
    }
  }
}

let root: Root | undefined;
let container: HTMLDivElement;

function fixture(count: number, suffix = "") {
  return [
    `@@ -1,${count} +1,${count} @@`,
    ...Array.from({ length: count }, (_, index) => `-const old${index} = ${index};`),
    ...Array.from({ length: count }, (_, index) => `+const next${index} = ${index + 1};${suffix}`),
  ].join("\n");
}

function render(content: string, path = "example.ts") {
  act(() => root?.render(<DiffPreview path={path} content={content} />));
}

function viewport() { return container.querySelector<HTMLDivElement>('[data-slot="diff-scroll"]')!; }
function rows() { return container.querySelectorAll<HTMLDivElement>("[data-index]"); }
function row(index: number) { return container.querySelector<HTMLDivElement>(`[data-index="${index}"]`)!; }
function totalHeight() { return Number.parseFloat(viewport().firstElementChild!.getAttribute("style")!.match(/height: ([\d.]+)px/)![1]); }
function nextFrame() { act(() => vi.advanceTimersToNextFrame()); }
function scroll(top: number) {
  act(() => {
    viewport().scrollTop = top;
    viewport().dispatchEvent(new Event("scroll"));
  });
  act(() => vi.advanceTimersByTime(200));
  act(() => rows().forEach((element) => TestResizeObserver.notify(element)));
  nextFrame();
}

beforeEach(() => {
  vi.mocked(reactVirtual.useVirtualizer).mockClear();
  vi.useFakeTimers();
  width = 800;
  heights.clear();
  observers.clear();
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(() => width);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute("data-index") ? heights.get(Number(this.dataset.index)) ?? 21 : 420;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { width: this.offsetWidth, height: this.offsetHeight, top: 0, left: 0, bottom: this.offsetHeight, right: this.offsetWidth, x: 0, y: 0, toJSON: () => ({}) };
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
  root = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("动态高度 diff 虚拟列表", () => {
  it("3000 行首次只挂载窗口，滚到末尾仍可读取最后一行", () => {
    const highlight = vi.spyOn(hljs, "highlight");
    render(fixture(3000));
    expect(viewport()).not.toBeNull();
    expect(rows().length).toBeGreaterThan(0);
    expect(rows().length).toBeLessThanOrEqual(40);
    expect(container.querySelectorAll("*").length).toBeLessThan(600);
    expect(highlight.mock.calls.length).toBeLessThanOrEqual(80);
    expect(totalHeight()).toBe(3000 * 21);
    scroll(totalHeight() - 420);
    expect(row(2999)?.textContent).toContain("const next2999 = 3000;");
    expect(rows().length).toBeLessThanOrEqual(40);
    scroll(0);
    expect(row(0)?.textContent).toContain("const old0 = 0;");
  });

  it("滚动时已挂载的行不重新高亮", () => {
    const highlight = vi.spyOn(hljs, "highlight");
    render(fixture(3000));
    const existing = new Set(Array.from(rows(), (node) => Number(node.dataset.index)));
    highlight.mockClear();
    scroll(21);
    const added = Array.from(rows()).filter((node) => !existing.has(Number(node.dataset.index)));
    expect(highlight).toHaveBeenCalledTimes(added.length * 2);
    expect(highlight.mock.calls.some(([content]) => content === "const old0 = 0;")).toBe(false);
  });

  it("折行高度通知会更新后续行位置和总高度", () => {
    heights.set(0, 63);
    render(fixture(3000));
    expect(row(1).style.transform).toBe("translateY(63px)");
    expect(totalHeight()).toBe(3000 * 21 + 42);
    act(() => {
      heights.set(0, 105);
      TestResizeObserver.notify(row(0));
    });
    expect(row(1).style.transform).toBe("translateY(63px)");
    nextFrame();
    expect(row(1).style.transform).toBe("translateY(105px)");
    expect(totalHeight()).toBe(3000 * 21 + 84);
    expect(row(0).querySelector("pre")?.className).toContain("[overflow-wrap:anywhere]");
  });

  it("宽度变化清除不可见行旧高度，并立即重测当前行", () => {
    heights.set(0, 105);
    render(fixture(3000));
    const element = viewport();
    scroll(2100);
    expect(row(0)).toBeNull();
    act(() => {
      width = 400;
      heights.set(0, 189);
      TestResizeObserver.notify(element);
    });
    nextFrame();
    expect(totalHeight()).toBe(3000 * 21);
    scroll(0);
    expect(row(1).style.transform).toBe("translateY(189px)");
    expect(totalHeight()).toBe(3000 * 21 + 168);
    act(() => {
      width = 800;
      heights.set(0, 63);
      TestResizeObserver.notify(viewport());
    });
    nextFrame();
    expect(row(1).style.transform).toBe("translateY(63px)");
    expect(totalHeight()).toBe(3000 * 21 + 42);
  });

  it("首次宽度通知不丢失已测量且高度未变的长行", () => {
    heights.set(0, 121);
    heights.set(17, 121);
    render(fixture(3000));
    expect(totalHeight()).toBe(63200);
    act(() => TestResizeObserver.notify(viewport(), 785));
    nextFrame();
    expect(totalHeight()).toBe(63200);
    expect(row(1).style.transform).toBe("translateY(121px)");
    expect(row(18).style.transform).toBe("translateY(578px)");
  });

  it("宽度通知不直接重测，同帧多次 resize 只合并为一次测量", () => {
    const hook = vi.mocked(reactVirtual.useVirtualizer);
    render(fixture(3000));
    const measure = vi.spyOn(hook.mock.results[0].value, "measure");
    act(() => {
      for (const next of [700, 600, 380]) {
        width = next;
        TestResizeObserver.notify(viewport());
      }
      heights.set(0, 321);
    });
    expect(measure).not.toHaveBeenCalled();
    nextFrame();
    expect(measure).toHaveBeenCalledTimes(1);
    expect(row(1).style.transform).toBe("translateY(321px)");
    expect(totalHeight()).toBe(63300);
    act(() => TestResizeObserver.notify(viewport()));
    nextFrame();
    expect(measure).toHaveBeenCalledTimes(1);
  });

  it.each(["unmount", "path", "content"])("%s 时取消待执行的宽度测量帧", (change) => {
    const hook = vi.mocked(reactVirtual.useVirtualizer);
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    const content = fixture(3000);
    render(content);
    const measure = vi.spyOn(hook.mock.results[0].value, "measure");
    act(() => {
      width = 380;
      TestResizeObserver.notify(viewport());
    });
    expect(measure).not.toHaveBeenCalled();
    if (change === "unmount") {
      act(() => root?.unmount());
      root = undefined;
    } else {
      render(change === "content" ? fixture(3000, " // changed") : content, change === "path" ? "other.ts" : "example.ts");
    }
    expect(cancel).toHaveBeenCalled();
    nextFrame();
    expect(measure).not.toHaveBeenCalled();
  });

  it.each(["path", "content"])("切换 %s 重置滚动和高度缓存", (change) => {
    const content = fixture(3000);
    heights.set(0, 105);
    render(content);
    const previous = viewport();
    scroll(2100);
    heights.clear();
    render(change === "content" ? fixture(3000, " // updated") : content, change === "path" ? "other.ts" : "example.ts");
    expect(viewport()).not.toBe(previous);
    expect(viewport().scrollTop).toBe(0);
    expect(row(0)).not.toBeNull();
    expect(totalHeight()).toBe(3000 * 21);
  });

  it("200 行完整呈现，201 行启用虚拟化", () => {
    render(fixture(200));
    expect(rows()).toHaveLength(200);
    expect(row(199).style.position).toBe("");
    render(fixture(201));
    expect(rows().length).toBeLessThanOrEqual(40);
    expect(row(0).style.position).toBe("absolute");
  });

  it("虚拟化后复制仍包含未挂载的完整 diff", () => {
    vi.useRealTimers();
    const content = fixture(3000);
    const writeText = vi.fn(() => Promise.resolve());
    const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    act(() => root?.render(<FilePreview preview={{ kind: "text", mode: "diff", path: "example.ts", language: "diff", content }} onClose={() => undefined} />));
    return Promise.resolve(act(() => vi.dynamicImportSettled())).then(() => {
      expect(rows().length).toBeLessThanOrEqual(40);
      expect(row(2999)).toBeNull();
      return Promise.resolve(act(() => {
        container.querySelector<HTMLButtonElement>('button[aria-label="复制内容"]')!.click();
        return Promise.resolve();
      }));
    }).then(() => {
      expect(writeText).toHaveBeenCalledWith(content);
    }).finally(() => {
      if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
      else Reflect.deleteProperty(navigator, "clipboard");
    });
  });
});
