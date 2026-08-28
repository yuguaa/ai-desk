import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ConversationChangesBar } from "@/components/chat/ConversationChangesBar";

const handlers = {
  onViewChanges: vi.fn(),
  onRefresh: vi.fn(),
  onPreviewChange: vi.fn(),
};

describe("ConversationChangesBar", () => {
  it("结束后未修改文件时展示完成横幅", () => {
    const html = renderToStaticMarkup(<ConversationChangesBar
      change={{
        cwd: "/demo",
        conversationId: "session-1",
        turnIndex: 0,
        promptFingerprint: "4:test",
        baselineTree: "tree-0",
        phase: "completed",
        status: null,
      }}
      {...handlers}
    />);

    expect(html).toContain("本次执行未修改文件");
    expect(html).toContain('data-layout="banner"');
  });

  it("结束后展示本回合修改文件数", () => {
    const html = renderToStaticMarkup(<ConversationChangesBar
      change={{
        cwd: "/demo",
        conversationId: "session-1",
        turnIndex: 0,
        promptFingerprint: "4:test",
        baselineTree: "tree-0",
        phase: "completed",
        status: {
          branch: "main",
          clean: false,
          additions: 8,
          deletions: 3,
          files: [{ path: "src/App.tsx", code: "M" }, { path: "src/new.ts", code: "A" }],
        },
      }}
      {...handlers}
    />);

    expect(html).toContain("本次执行修改了 2 个文件");
    expect(html).toContain("+8 / -3");
    expect(html).toContain('data-layout="banner"');
  });
});
