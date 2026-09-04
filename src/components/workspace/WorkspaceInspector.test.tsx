import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceInspector } from "@/components/workspace/WorkspaceInspector";
import { TooltipProvider } from "@/components/ui/tooltip";

const handlers = {
  onTabChange: vi.fn(),
  onRefresh: vi.fn(),
  onOpenFile: vi.fn(),
  onOpenDiff: vi.fn(),
  onClosePreview: vi.fn(),
  onGitAction: vi.fn(() => Promise.resolve(true)),
  onGitNoticeDismiss: vi.fn(),
};

describe("WorkspaceInspector", () => {
  it("在文件列表右侧显示文件预览分屏", () => {
    const html = renderToStaticMarkup(<TooltipProvider><WorkspaceInspector tab="files" files={[{ path: "src/App.tsx", name: "App.tsx", kind: "file", size: 12 }]} gitStatus={null} preview={{ kind: "text", path: "src/App.tsx", language: "typescript", content: "export default App", mode: "file" }} selectedPath="src/App.tsx" isLoading={false} error={null} gitOperation={null} gitNotice={null} {...handlers} /></TooltipProvider>);

    expect(html).toContain('data-slot="resizable-panel-group"');
    expect(html).toContain('placeholder="筛选文件"');
    expect(html).toContain("hljs-keyword");
    expect(html).toContain("App");
    expect(html).toContain('aria-label="关闭预览"');
    expect(html).toMatch(/aria-label="调整预览宽度"[^>]*aria-orientation="vertical"/);
    expect(html).not.toContain("lucide-move-horizontal");
  });

  it("在 Git 变更列表右侧显示 diff 预览分屏和选中态", () => {
    const html = renderToStaticMarkup(<TooltipProvider><WorkspaceInspector tab="git" files={[]} gitStatus={{ branch: "main", clean: false, additions: 1, deletions: 1, files: [{ code: " M", path: "src/App.tsx" }] }} preview={{ kind: "text", path: "src/App.tsx", language: "diff", content: "@@ -1 +1 @@\n-old\n+new", mode: "diff" }} selectedPath="src/App.tsx" isLoading={false} error={null} gitOperation={null} gitNotice={null} {...handlers} /></TooltipProvider>);

    expect(html).toContain("未暂存的更改");
    expect(html).toContain('data-slot="git-change-count"');
    expect(html).toContain(">1</span>");
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("HEAD");
    expect(html).toContain("工作区");
    expect(html).toContain('aria-label="拉取（仅快进）"');
    expect(html).toContain('aria-label="推送当前分支"');
    expect(html).toContain("暂存全部");
    expect(html).toContain('aria-label="Git 提交信息"');
    expect(html).toMatch(/aria-label="调整预览宽度"[^>]*aria-orientation="vertical"/);
    expect(html).not.toContain("lucide-move-horizontal");
  });

  it("Git 状态干净时不显示变更数量", () => {
    const html = renderToStaticMarkup(<TooltipProvider><WorkspaceInspector tab="git" files={[]} gitStatus={{ branch: "main", clean: true, additions: 0, deletions: 0, files: [] }} preview={null} selectedPath={null} isLoading={false} error={null} gitOperation={null} gitNotice={null} {...handlers} /></TooltipProvider>);

    expect(html).not.toContain('data-slot="git-change-count"');
  });

  it("在文件列表右侧显示图片预览且不提供复制操作", () => {
    const html = renderToStaticMarkup(<TooltipProvider><WorkspaceInspector tab="files" files={[{ path: "assets/pixel.bmp", name: "pixel.bmp", kind: "file", size: 12 }]} gitStatus={null} preview={{ kind: "image", path: "assets/pixel.bmp", mimeType: "image/bmp", data: "Qk0=", mode: "file" }} selectedPath="assets/pixel.bmp" isLoading={false} error={null} gitOperation={null} gitNotice={null} {...handlers} /></TooltipProvider>);

    expect(html).toContain('src="data:image/bmp;base64,Qk0="');
    expect(html).toContain('alt="assets/pixel.bmp"');
    expect(html).toContain("lucide-file-image");
    expect(html).not.toContain('aria-label="复制内容"');
  });
});
