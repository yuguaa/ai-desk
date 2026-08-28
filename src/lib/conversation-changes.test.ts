// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  getConversationChanges,
  getConversationTurnFingerprint,
  getConversationTurnKey,
  loadConversationTurnChanges,
  saveConversationTurnChanges,
} from "@/lib/conversation-changes";
import type { GitStatus } from "@/types/workspace";

const baseStatus: GitStatus = {
  branch: "main",
  clean: true,
  additions: 0,
  deletions: 0,
  files: [],
};

describe("getConversationChanges", () => {
  it("忽略 clean snapshot", () => {
    expect(getConversationChanges(baseStatus)).toBeNull();
  });

  it("保留 baseline 前已存在修改但本次对话继续变更的文件", () => {
    expect(getConversationChanges({
      ...baseStatus,
      clean: false,
      additions: 7,
      deletions: 2,
      files: [
        { path: "src/App.tsx", code: "M " },
        { path: "src/App.tsx", code: "M " },
        { path: "src/new.ts", code: "??" },
      ],
    })).toEqual({
      ...baseStatus,
      clean: false,
      additions: 7,
      deletions: 2,
      files: [
        { path: "src/App.tsx", code: "M" },
        { path: "src/new.ts", code: "??" },
      ],
    });
  });

  it("文件恢复干净后不会再误报删除", () => {
    expect(getConversationChanges({
      ...baseStatus,
      clean: false,
      additions: 0,
      deletions: 1,
      files: [{ path: "src/obsolete.ts", code: "D " }],
    })).toEqual({
      ...baseStatus,
      clean: false,
      additions: 0,
      deletions: 1,
      files: [{ path: "src/obsolete.ts", code: "D" }],
    });

    expect(getConversationChanges(baseStatus)).toBeNull();
  });
});

describe("conversation turn changes storage", () => {
  it("同一提示词生成稳定指纹，不同提示词不会复用统计", () => {
    expect(getConversationTurnFingerprint("修改当前页面")).toBe(getConversationTurnFingerprint("修改当前页面"));
    expect(getConversationTurnFingerprint("修改当前页面")).not.toBe(getConversationTurnFingerprint("修改设置页面"));
  });

  it("只持久化已完成回合，并按项目、会话和回合隔离", () => {
    const completedKey = getConversationTurnKey("/demo", "session-1", 0);
    const runningKey = getConversationTurnKey("/demo", "session-1", 1);

    saveConversationTurnChanges({
      [completedKey]: {
        cwd: "/demo",
        conversationId: "session-1",
        turnIndex: 0,
        promptFingerprint: "4:test",
        baselineTree: "tree-0",
        phase: "completed",
        status: { ...baseStatus, clean: false, additions: 3, deletions: 1, files: [{ path: "src/App.tsx", code: "M " }] },
      },
      [runningKey]: {
        cwd: "/demo",
        conversationId: "session-1",
        turnIndex: 1,
        promptFingerprint: "4:next",
        baselineTree: "tree-1",
        phase: "running",
        status: null,
      },
    });

    expect(loadConversationTurnChanges()).toEqual({
      [completedKey]: {
        cwd: "/demo",
        conversationId: "session-1",
        turnIndex: 0,
        promptFingerprint: "4:test",
        baselineTree: "tree-0",
        phase: "completed",
        status: { ...baseStatus, clean: false, additions: 3, deletions: 1, files: [{ path: "src/App.tsx", code: "M" }] },
      },
    });
  });

  it("忽略损坏的持久化数据", () => {
    localStorage.setItem("ai-desk.conversation-turn-changes", JSON.stringify({ broken: { phase: "completed" } }));
    expect(loadConversationTurnChanges()).toEqual({});
  });

  it("最多保留最近 100 个已完成回合，并返回可释放的旧 snapshot", () => {
    const changes = Object.fromEntries(Array.from({ length: 101 }, (_, index) => [
      getConversationTurnKey("/demo", "session-1", index),
      {
        cwd: "/demo",
        conversationId: "session-1",
        turnIndex: index,
        promptFingerprint: `prompt-${index}`,
        baselineTree: `tree-${index}`,
        phase: "completed" as const,
        completedAt: index,
        status: null,
      },
    ]));

    expect(saveConversationTurnChanges(changes).map((entry) => entry.baselineTree)).toEqual(["tree-0"]);
    expect(Object.keys(loadConversationTurnChanges())).toHaveLength(100);
  });
});
