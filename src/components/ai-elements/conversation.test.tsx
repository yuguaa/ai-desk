// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Conversation } from "@/components/ai-elements/conversation";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe("Conversation", () => {
  it("离开底部时显示按钮，并可平滑滚动到底部", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Conversation><div>消息内容</div></Conversation>);
    });

    const viewport = container.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    expect(viewport).not.toBeNull();
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 900 },
      scrollTop: { configurable: true, writable: true, value: 200 },
    });
    const scrollTo = vi.fn();
    Object.defineProperty(viewport, "scrollTo", { configurable: true, value: scrollTo });

    await act(async () => {
      viewport?.dispatchEvent(new Event("scroll"));
    });

    const scrollButton = container.querySelector<HTMLButtonElement>('button[aria-label="滚动到底部"]');
    expect(scrollButton).not.toBeNull();
    expect(scrollButton?.className).toContain("bottom-4");
    expect(scrollButton?.className).toContain("z-30");
    act(() => scrollButton?.click());
    expect(scrollTo).toHaveBeenCalledWith({ top: 600, behavior: "smooth" });
  });

  it("位于底部时隐藏滚动按钮", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Conversation><div>消息内容</div></Conversation>);
    });

    const viewport = container.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 900 },
      scrollTop: { configurable: true, writable: true, value: 600 },
    });

    await act(async () => {
      viewport?.dispatchEvent(new Event("scroll"));
    });

    expect(container.querySelector('button[aria-label="滚动到底部"]')).toBeNull();
  });

  it("位于底部时随新增消息自动滚动", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Conversation><div>第一条消息</div></Conversation>);
    });

    const viewport = container.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    let scrollHeight = 900;
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, get: () => scrollHeight },
      scrollTop: { configurable: true, writable: true, value: 600 },
    });

    await act(async () => {
      viewport?.dispatchEvent(new Event("scroll"));
    });

    scrollHeight = 1_200;
    await act(async () => {
      root?.render(<Conversation><div>第二条模型回复</div></Conversation>);
    });

    expect(viewport?.scrollTop).toBe(900);
  });

  it("用户上滑后新增消息不会强制滚动", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Conversation><div>第一条消息</div></Conversation>);
    });

    const viewport = container.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    let scrollHeight = 900;
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, get: () => scrollHeight },
      scrollTop: { configurable: true, writable: true, value: 200 },
    });

    await act(async () => {
      viewport?.dispatchEvent(new Event("scroll"));
    });

    scrollHeight = 1_200;
    await act(async () => {
      root?.render(<Conversation><div>第二条模型回复</div></Conversation>);
    });

    expect(viewport?.scrollTop).toBe(200);
    expect(container.querySelector('button[aria-label="滚动到底部"]')).not.toBeNull();
  });
});
