// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimelineItemView } from "@/components/chat/TimelineItemView";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe("TimelineItemView", () => {
  it("用户消息自身展示复制操作和时间戳", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<TimelineItemView item={{ id: "user-1", type: "user", text: "检查用户消息", time: "今天 15:40" }} />);
      await Promise.resolve();
    });

    const copyButton = container.querySelector<HTMLButtonElement>('button[aria-label="复制消息"]');
    expect(copyButton).not.toBeNull();
    expect(container.textContent).toContain("今天 15:40");

    await act(async () => {
      copyButton?.click();
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith("检查用户消息");
  });
});
