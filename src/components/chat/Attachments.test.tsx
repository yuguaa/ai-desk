// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Attachments } from "./Attachments";
import type { Attachment } from "@/lib/attachments";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
let root: Root;
let container: HTMLDivElement;
const attachments: Attachment[] = [
  { id: "img1", name: "示例.png", type: "image", data: "aGVsbG8=", mimeType: "image/png" },
  { id: "file1", name: "README.md", type: "file", content: "hello", size: 5 },
];

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

function render(onRemove?: (id: string) => void) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  return act(() => root.render(<Attachments attachments={attachments} onRemove={onRemove} />));
}

describe("Attachments", () => {
  it("图片显示缩略图与名称，移除传回附件 ID", async () => {
    const onRemove = vi.fn();
    await render(onRemove);
    expect(container.querySelector("img")!.getAttribute("src")).toBe("data:image/png;base64,aGVsbG8=");
    expect(container.textContent).toContain("示例.png");
    expect(container.textContent).toContain("README.md");
    await act(() => container.querySelector<HTMLButtonElement>('[aria-label="移除附件：示例.png"]')!.click());
    expect(onRemove).toHaveBeenCalledWith("img1");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("文件附件展示名称，移除传回附件 ID", async () => {
    const onRemove = vi.fn();
    await render(onRemove);
    await act(() => container.querySelector<HTMLButtonElement>('[aria-label="移除附件：README.md"]')!.click());
    expect(onRemove).toHaveBeenCalledWith("file1");
  });

  it("历史附件不显示移除，Radix 预览可关闭并恢复焦点", async () => {
    await render();
    expect(container.querySelector('[aria-label="移除附件：示例.png"]')).toBeNull();
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="放大预览：示例.png"]')!;
    await act(() => trigger.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    expect(dialog.querySelector('img')!.alt).toBe('示例.png');
    await act(() => document.querySelector<HTMLButtonElement>('[aria-label="关闭图片预览"]')!.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    /* Radix 在卸载后的定时任务中恢复焦点，等待真实生命周期完成。 */
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
