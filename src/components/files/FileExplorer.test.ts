import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildFileTree, FileExplorer } from "@/components/files/FileExplorer";

describe("buildFileTree", () => {
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
