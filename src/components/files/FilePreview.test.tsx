import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FilePreview } from "@/components/files/FilePreview";
import type { InspectorPreview } from "@/hooks/use-workspace-inspector";

describe("FilePreview", () => {
  it("使用图片数据渲染工作区图片", () => {
    const preview: InspectorPreview = {
      kind: "image",
      path: "assets/example.png",
      mimeType: "image/png",
      data: "iVBORw0KGgo=",
      mode: "file",
    };

    const html = renderToStaticMarkup(<FilePreview preview={preview} onClose={vi.fn()} />);

    expect(html).toContain('<img');
    expect(html).toContain('src="data:image/png;base64,iVBORw0KGgo="');
    expect(html).toContain('alt="assets/example.png"');
    expect(html).not.toContain('aria-label="复制内容"');
  });

  it("保留文本预览和复制操作", () => {
    const preview: InspectorPreview = {
      kind: "text",
      path: "src/example.ts",
      language: "typescript",
      content: "const answer = 42;",
      mode: "file",
    };

    const html = renderToStaticMarkup(<FilePreview preview={preview} onClose={vi.fn()} />);

    expect(html).toContain("hljs-keyword");
    expect(html).toContain('aria-label="复制内容"');
    expect(html).not.toContain("<img");
  });

  it("保留文本 diff 预览", () => {
    const preview: InspectorPreview = {
      kind: "text",
      path: "src/example.ts",
      language: "diff",
      content: "@@ -1 +1 @@\n-old\n+new",
      mode: "diff",
    };

    const html = renderToStaticMarkup(<FilePreview preview={preview} onClose={vi.fn()} />);

    expect(html).toContain("HEAD");
    expect(html).toContain("工作区");
    expect(html).toContain('aria-label="复制内容"');
  });
});
