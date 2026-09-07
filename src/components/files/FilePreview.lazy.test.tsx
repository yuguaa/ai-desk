// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { FilePreview } from "@/components/files/FilePreview";
import type { InspectorPreview } from "@/hooks/use-workspace-inspector";

const loads = vi.hoisted(() => ({ code: vi.fn(), diff: vi.fn() }));
vi.mock("@/components/files/CodeBlock", () => {
  loads.code();
  return { CodeBlock: ({ content }: { content: string }) => <pre>{content}</pre> };
});
vi.mock("@/components/files/DiffPreview", () => {
  loads.diff();
  return { DiffPreview: ({ content }: { content: string }) => <pre>{content}</pre> };
});

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

it("图片不加载重模块，文本不加载 diff，加载期间复制关闭可用且再次打开复用模块", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onClose = vi.fn();
  const writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const image: InspectorPreview = { kind: "image", mode: "file", path: "a.png", mimeType: "image/png", data: "abc" };
  const text: InspectorPreview = { kind: "text", mode: "file", path: "a.ts", language: "typescript", content: "const a = 1;" };
  const diff: InspectorPreview = { ...text, mode: "diff" };
  const render = (preview: InspectorPreview) => {
    act(() => root.render(<FilePreview preview={preview} onClose={onClose} />));
    return Promise.resolve(act(() => vi.dynamicImportSettled()));
  };
  return render(image).then(() => {
    expect(container.querySelector("img")).not.toBeNull();
    expect(loads.code).not.toHaveBeenCalled();
    expect(loads.diff).not.toHaveBeenCalled();
    act(() => root.render(<FilePreview preview={text} onClose={onClose} />));
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.textContent).toContain("typescript");
    return Promise.resolve(act(() => {
      container.querySelector<HTMLButtonElement>('button[aria-label="复制内容"]')!.click();
      container.querySelector<HTMLButtonElement>('button[aria-label="关闭预览"]')!.click();
      return vi.dynamicImportSettled();
    }));
  }).then(() => {
    expect(onClose).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith(text.content);
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    expect(loads.code).toHaveBeenCalledOnce();
    expect(loads.diff).not.toHaveBeenCalled();
    return render(diff);
  }).then(() => {
    expect(loads.diff).toHaveBeenCalledOnce();
    return render(text);
  }).then(() => {
    expect(loads.code).toHaveBeenCalledOnce();
    expect(loads.diff).toHaveBeenCalledOnce();
  }).finally(() => {
    act(() => root.unmount());
    container.remove();
  });
});
