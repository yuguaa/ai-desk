// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Terminal } from "@/components/ai-elements/terminal";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function createContainer() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
}

describe("Terminal", () => {
  it("用户查看历史输出时不强制滚回底部", async () => {
    createContainer();

    await act(async () => {
      root?.render(<Terminal isStreaming output="第一段" />);
      await Promise.resolve();
    });

    const content = container?.querySelector<HTMLElement>('[data-slot="terminal-content"]');
    Object.defineProperties(content, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 1000 },
      scrollTop: { configurable: true, writable: true, value: 120 },
    });

    await act(async () => {
      content?.dispatchEvent(new Event("scroll", { bubbles: true }));
      root?.render(<Terminal isStreaming output="第二段" />);
      await Promise.resolve();
    });

    expect(content?.scrollTop).toBe(120);
  });

  it("复制成功后更新按钮的辅助文本", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    createContainer();

    await act(async () => {
      root?.render(<Terminal output="pnpm test" />);
      await Promise.resolve();
    });

    const copyButton = container?.querySelector<HTMLButtonElement>('button[aria-label="复制终端内容"]');
    await act(async () => {
      copyButton?.click();
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith("pnpm test");
    expect(container?.querySelector('button[aria-label="已复制终端内容"]')).not.toBeNull();
  });
});
