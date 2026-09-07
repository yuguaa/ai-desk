// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilePreview } from "@/components/files/FilePreview";
import type { InspectorPreview } from "@/hooks/use-workspace-inspector";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
let root: Root | undefined;
let container: HTMLDivElement;

function renderPreview(preview: InspectorPreview) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<FilePreview preview={preview} onClose={vi.fn()} />));
  return Promise.resolve(act(() => vi.dynamicImportSettled())).then(() => container.innerHTML);
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
});

describe("FilePreview", () => {
  it("使用图片数据渲染工作区图片", () => {
    const preview: InspectorPreview = {
      kind: "image",
      path: "assets/example.png",
      mimeType: "image/png",
      data: "iVBORw0KGgo=",
      mode: "file",
    };

    return renderPreview(preview).then((html) => {
      expect(html).toContain('<img');
      expect(html).toContain('src="data:image/png;base64,iVBORw0KGgo="');
      expect(html).toContain('alt="assets/example.png"');
      expect(html).not.toContain('aria-label="复制内容"');
    });
  });

  it("保留文本预览和复制操作", () => {
    const preview: InspectorPreview = {
      kind: "text",
      path: "src/example.ts",
      language: "typescript",
      content: "const answer = 42;",
      mode: "file",
    };

    return renderPreview(preview).then((html) => {
      expect(html).toContain("hljs-keyword");
      expect(html).toContain('aria-label="复制内容"');
      expect(html).not.toContain("<img");
    });
  });

  it("保留文本 diff 预览", () => {
    const preview: InspectorPreview = {
      kind: "text",
      path: "src/example.ts",
      language: "diff",
      content: "@@ -1 +1 @@\n-old\n+new",
      mode: "diff",
    };

    return renderPreview(preview).then((html) => {
      expect(html).toContain("HEAD");
      expect(html).toContain("工作区");
      expect(html).toContain('aria-label="复制内容"');
    });
  });
});
