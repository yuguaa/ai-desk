// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import hljs from "highlight.js/lib/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeBlock, InlineCode } from "@/components/files/CodeBlock";
import { DiffPreview } from "@/components/files/DiffPreview";
import { FilePreview } from "@/components/files/FilePreview";
import type { InspectorPreview } from "@/hooks/use-workspace-inspector";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

let root: Root | undefined;
let container: HTMLDivElement;

function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("预览计算与 DOM 开销", () => {
  it.each(["file", "diff"] as const)("%s 复制状态更新不重新高亮内容", (mode) => {
    const highlight = vi.spyOn(hljs, "highlight");
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const preview = {
      kind: "text", path: "example.ts", language: "typescript", mode,
      content: mode === "diff" ? "@@ -1 +1 @@\n-const old = 1;\n+const next = 2;" : "const value = 1;",
    } satisfies InspectorPreview;
    mount();
    act(() => root?.render(<FilePreview preview={preview} onClose={() => undefined} />));
    return Promise.resolve(act(() => vi.dynamicImportSettled())).then(() => {
      vi.useFakeTimers();
      expect(highlight).toHaveBeenCalled();
      highlight.mockClear();
      return Promise.resolve(act(() => {
        container.querySelector<HTMLButtonElement>('button[aria-label="复制内容"]')!.click();
        return Promise.resolve();
      }));
    }).then(() => {
      expect(writeText).toHaveBeenCalledWith(preview.content);
      expect(highlight).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1200));
      expect(highlight).not.toHaveBeenCalled();
    });
  });

  it.each([CodeBlock, InlineCode])("样式变化复用高亮，内容和语言变化重新计算", (Component) => {
    const highlight = vi.spyOn(hljs, "highlight");
    mount();
    act(() => root?.render(<Component content="const value = 1;" language="typescript" />));
    highlight.mockClear();
    act(() => root?.render(<Component content="const value = 1;" language="typescript" className="test" />));
    expect(highlight).not.toHaveBeenCalled();
    act(() => root?.render(<Component content="const value = 2;" language="typescript" />));
    expect(highlight).toHaveBeenCalledTimes(1);
    act(() => root?.render(<Component content="const value = 2;" language="javascript" />));
    expect(highlight).toHaveBeenCalledTimes(2);
    expect(container.querySelector("code")?.textContent).toBe("const value = 2;");
  });

  it("万行纯文本保留完整正文与行号，行号 DOM 数量不随行数增长", () => {
    const content = "<script>&\n".repeat(10000);
    mount();
    act(() => root?.render(<CodeBlock content={content} language="plaintext" showLineNumbers />));
    expect(container.querySelector("code")?.textContent).toBe(content);
    expect(container.querySelector("script")).toBeNull();
    const gutter = container.querySelector('[aria-hidden="true"]')!;
    expect(gutter.childElementCount).toBe(0);
    expect(gutter.textContent?.split("\n")).toEqual(Array.from({ length: 10001 }, (_, index) => String(index + 1)));
  });

  it("空文本、末尾换行和行号显隐更新正确", () => {
    mount();
    act(() => root?.render(<CodeBlock content="" language="plaintext" showLineNumbers />));
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe("1");
    act(() => root?.render(<CodeBlock content={"a\n"} language="plaintext" showLineNumbers />));
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe("1\n2");
    act(() => root?.render(<CodeBlock content={"a\n"} language="plaintext" />));
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(container.querySelector("code")?.textContent).toBe("a\n");
  });

  it("diff 内容和路径变化刷新结果，支持切换空状态", () => {
    const highlight = vi.spyOn(hljs, "highlight");
    const content = "@@ -1 +1 @@\n+const value = 1;";
    mount();
    act(() => root?.render(<DiffPreview path="example.ts" content={content} />));
    expect(container.querySelector(".hljs-keyword")).not.toBeNull();
    highlight.mockClear();
    act(() => root?.render(<DiffPreview path="example.ts" content={content} />));
    expect(highlight).not.toHaveBeenCalled();
    act(() => root?.render(<DiffPreview path="example.txt" content={content} />));
    expect(container.querySelector(".hljs-keyword")).toBeNull();
    act(() => root?.render(<DiffPreview path="example.txt" content="@@ -1 +1 @@\n+updated" />));
    expect(container.textContent).toContain("updated");
    expect(container.textContent).not.toContain("const value");
    act(() => root?.render(<DiffPreview path="example.txt" content="" />));
    expect(container.textContent).toContain("没有可显示的差异");
    act(() => root?.render(<DiffPreview path="example.txt" content={content} />));
    expect(container.textContent).toContain("const value = 1;");
  });
});
