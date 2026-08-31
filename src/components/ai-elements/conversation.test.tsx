// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Conversation } from "@/components/ai-elements/conversation";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe("Conversation", () => {
  it("使用反向列布局和底部弹性占位", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Conversation><div>消息内容</div></Conversation>);
    });

    const viewport = container.querySelector<HTMLElement>('[data-slot="conversation-scroll-viewport"]');
    const placeholder = container.querySelector<HTMLElement>('[data-slot="conversation-bottom-placeholder"]');
    expect(viewport?.className).toContain("flex-col-reverse");
    expect(placeholder?.className).toContain("flex-1");
    expect(placeholder?.className).toContain("shrink-0");
  });

  it("离开底部时显示按钮，并可平滑滚动到底部", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Conversation><div>消息内容</div></Conversation>);
    });

    const viewport = container.querySelector<HTMLElement>('[data-slot="conversation-scroll-viewport"]');
    expect(viewport).not.toBeNull();
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 900 },
      scrollTop: { configurable: true, writable: true, value: -200 },
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
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("位于底部时隐藏滚动按钮", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Conversation><div>消息内容</div></Conversation>);
    });

    const viewport = container.querySelector<HTMLElement>('[data-slot="conversation-scroll-viewport"]');
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 900 },
      scrollTop: { configurable: true, writable: true, value: 0 },
    });

    await act(async () => {
      viewport?.dispatchEvent(new Event("scroll"));
    });

    expect(container.querySelector('button[aria-label="滚动到底部"]')).toBeNull();
  });

  it("底部弹性回拉产生正 scrollTop 时仍视为位于底部", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Conversation><div>消息内容</div></Conversation>);
    });

    const viewport = container.querySelector<HTMLElement>('[data-slot="conversation-scroll-viewport"]');
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 900 },
      scrollTop: { configurable: true, writable: true, value: 12 },
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

    scrollHeight = 1_200;
    await act(async () => {
      root?.render(<Conversation><div>第二条模型回复</div></Conversation>);
    });

    expect(viewport?.scrollTop).toBe(0);
  });

  it("用户上滑后新增消息不会强制滚动", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Conversation><div>第一条消息</div></Conversation>);
    });

    const viewport = container.querySelector<HTMLElement>('[data-slot="conversation-scroll-viewport"]');
    let scrollHeight = 900;
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, get: () => scrollHeight },
      scrollTop: { configurable: true, writable: true, value: -200 },
    });

    await act(async () => {
      viewport?.dispatchEvent(new Event("scroll"));
    });

    scrollHeight = 1_200;
    await act(async () => {
      root?.render(<Conversation><div>第二条模型回复</div></Conversation>);
    });

    expect(viewport?.scrollTop).toBe(-200);
    expect(container.querySelector('button[aria-label="滚动到底部"]')).not.toBeNull();
  });
});
