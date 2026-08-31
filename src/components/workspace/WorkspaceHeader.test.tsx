import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";

describe("WorkspaceHeader", () => {
  it("居左展示当前对话标题且不渲染 Pi 状态提示", () => {
    const html = renderToStaticMarkup(<WorkspaceHeader
      project={{ id: "/code/demo", name: "demo", path: "/code/demo" }}
      conversation={{ id: "session-1", projectId: "/code/demo", title: "居左的对话", preview: "", time: "刚刚" }}
    />);

    expect(html).toContain("居左的对话");
    expect(html).toContain("text-left");
    expect(html).not.toContain(">Pi<");
    expect(html).not.toContain("demo");
    expect(html).not.toContain("accent-border");
    expect(html).not.toContain("bg-[var(--bg-workspace)]");
    expect(html).toContain("bg-[var(--bg-sidebar)]");
  });
});
