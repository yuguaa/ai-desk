import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildFileTree, FileExplorer } from "@/components/files/FileExplorer";

describe("buildFileTree", () => {
  it("大量同级文件只挂载一次，不扫描已有兄弟节点", () => {
    const files = Array.from({ length: 2000 }, (_, index) => ({
      path: `src/file-${index}.ts`, name: `file-${index}.ts`, kind: "file" as const, size: index,
    }));
    const some = vi.spyOn(Array.prototype, "some");
    let scans: number;
    let tree: ReturnType<typeof buildFileTree>;
    try {
      tree = buildFileTree([...files, { ...files[0], size: 99 }, { path: "src", name: "src", kind: "directory", size: 0 }]);
      scans = some.mock.calls.length;
    } finally {
      some.mockRestore();
    }
    expect(tree[0].children).toHaveLength(files.length);
    expect(tree[0].children.find((node) => node.path === files[0].path)?.size).toBe(99);
    expect(scans).toBe(0);
  });

  it("为扁平文件列表补齐缺失的父级文件夹", () => {
    const tree = buildFileTree([
      { path: "src/components/App.tsx", name: "App.tsx", kind: "file", size: 12 },
      { path: "README.md", name: "README.md", kind: "file", size: 4 },
    ]);

    expect(tree.map((node) => node.path)).toEqual(["src", "README.md"]);
    expect(tree[0].children.map((node) => node.path)).toEqual(["src/components"]);
    expect(tree[0].children[0].children[0].path).toBe("src/components/App.tsx");
  });

  it("长文件名保持在右侧面板宽度内并使用省略号", () => {
    const name = "这是一个非常长而且需要在右侧面板中正确显示省略号的文件名称.tsx";
    const html = renderToStaticMarkup(createElement(FileExplorer, {
      files: [{ path: name, name, kind: "file", size: 12 }],
      selectedPath: null,
      isLoading: false,
      onOpenFile: () => undefined,
      onRefresh: () => undefined,
    }));

    expect(html).toContain("panel-scroll-area");
    expect(html).toContain("overflow-hidden");
    expect(html).toContain("truncate");
  });
});
