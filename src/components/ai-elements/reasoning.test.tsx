// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { Reasoning } from "@/components/ai-elements/reasoning";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe("Reasoning", () => {
  it("占满对话内容列宽度", () => {
    const html = renderToStaticMarkup(<Reasoning content="分析内容" />);

    expect(html).toContain("w-full");
    expect(html).not.toContain("max-w-[72ch]");
  });

  it("默认展开并限制内容最大高度", () => {
    const html = renderToStaticMarkup(<Reasoning content="分析内容" />);

    expect(html).toContain('data-state="open"');
    expect(html).toContain('data-slot="reasoning-content"');
    expect(html).toContain("max-h-64");
    expect(html).toContain("flex-col-reverse");
    expect(html).toContain("overflow-y-auto");
  });

  it("允许调用方显式设置为默认折叠", () => {
    const html = renderToStaticMarkup(<Reasoning content="分析内容" defaultOpen={false} />);

    expect(html).toContain('data-state="closed"');
    expect(html).not.toContain('data-slot="reasoning-content"');
  });

  it("思考过程中随新增内容保持贴在底部（flex-col-reverse）", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Reasoning content="第一段" status="running" />);
      await Promise.resolve();
    });

    const content = container.querySelector<HTMLElement>('[data-slot="reasoning-content"]');
    Object.defineProperties(content, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 600 },
      scrollTop: { configurable: true, writable: true, value: 0 },
    });

    await act(async () => {
      root?.render(<Reasoning content="第一段\n第二段" status="running" />);
      await Promise.resolve();
    });

    // 反向布局下底部即 scrollTop 0，新增内容后保持贴底
    expect(content?.scrollTop).toBe(0);
  });

  it("反向布局依赖原生锚定，不在每次增量写入 scrollTop", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Reasoning content="第一段" status="running" />);
      await Promise.resolve();
    });

    const content = container.querySelector<HTMLElement>('[data-slot="reasoning-content"]');
    const scrollWrites: number[] = [];
    let scrollTop = 0;
    Object.defineProperty(content, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
        scrollWrites.push(value);
      },
    });

    await act(async () => {
      root?.render(<Reasoning content="第一段\n第二段" status="running" />);
      await Promise.resolve();
    });

    expect(scrollWrites).toEqual([]);
  });

  it("用户上滑查看历史思考时不强制滚回底部", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Reasoning content="第一段" status="running" />);
      await Promise.resolve();
    });

    const content = container.querySelector<HTMLElement>('[data-slot="reasoning-content"]');
    Object.defineProperties(content, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 600 },
      // flex-col-reverse 下上滑看历史 scrollTop 为负值
      scrollTop: { configurable: true, writable: true, value: -120 },
    });

    await act(async () => {
      content?.dispatchEvent(new Event("scroll", { bubbles: true }));
      root?.render(<Reasoning content="第一段\n第二段" status="running" />);
      await Promise.resolve();
    });

    expect(content?.scrollTop).toBe(-120);
  });

  it("反向布局滚动时不读取 scrollTop", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Reasoning content="第一段" status="running" />);
      await Promise.resolve();
    });

    const content = container.querySelector<HTMLElement>('[data-slot="reasoning-content"]');
    let scrollTopReads = 0;
    Object.defineProperty(content, "scrollTop", {
      configurable: true,
      get: () => {
        scrollTopReads += 1;
        return -120;
      },
    });

    await act(async () => {
      content?.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    expect(scrollTopReads).toBe(0);
  });
});
