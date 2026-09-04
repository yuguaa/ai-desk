// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { normalizePiProjects, sortConversationsByPinned } from "@/lib/workspace-data";

beforeEach(() => {
  localStorage.clear();
});

describe("normalizePiProjects", () => {
  it("keeps project grouping while flattening session navigation data", () => {
    const result = normalizePiProjects([
      {
        id: "/workspace/demo",
        name: "demo",
        path: "/workspace/demo",
        conversations: [{ id: "session-1", title: "First", preview: "hello", time: "刚刚", sessionFile: "/tmp/session.jsonl", modifiedAt: "1", messageCount: 2 }],
      },
    ]);
    expect(result.nextProjects[0]).toMatchObject({ id: "/workspace/demo", name: "demo", path: "/workspace/demo" });
    expect(result.nextConversations).toEqual([{ id: "session-1", projectId: "/workspace/demo", title: "First", preview: "hello", time: "刚刚", modifiedAt: "1", sessionFile: "/tmp/session.jsonl" }]);
  });

  it("keeps manually added projects and filters archived sessions", () => {
    const result = normalizePiProjects([
      {
        id: "/workspace/demo",
        name: "demo",
        path: "/workspace/demo",
        conversations: [{ id: "session-1", title: "First", preview: "hello", time: "刚刚", sessionFile: "/tmp/session.jsonl", modifiedAt: "1", messageCount: 2 }],
      },
    ], { projectRoots: ["/workspace/empty"], hiddenProjectRoots: [], trustedProjectRoots: [], archivedConversationIds: ["session-1"], pinnedConversationIds: [], collapsedProjectIds: [] });

    expect(result.nextProjects.map((project) => project.path)).toEqual(["/workspace/demo", "/workspace/empty"]);
    expect(result.nextConversations).toEqual([]);
  });

  it("restores manually added projects before they have any sessions", () => {
    const result = normalizePiProjects([], { projectRoots: ["/workspace/new-project"], hiddenProjectRoots: [], trustedProjectRoots: [], archivedConversationIds: [], pinnedConversationIds: [], collapsedProjectIds: [] });

    expect(result.nextProjects.map((project) => project.path)).toEqual(["/workspace/new-project"]);
    expect(result.nextConversations).toEqual([]);
  });

  it("隐藏项目时同时过滤项目和磁盘会话", () => {
    const result = normalizePiProjects([
      {
        id: "/workspace/demo",
        name: "demo",
        path: "/workspace/demo",
        conversations: [{ id: "session-1", title: "First", preview: "hello", time: "刚刚", sessionFile: "/tmp/session.jsonl", modifiedAt: "1", messageCount: 2 }],
      },
    ], { projectRoots: ["/workspace/demo"], hiddenProjectRoots: ["/workspace/demo/"], trustedProjectRoots: [], archivedConversationIds: [], pinnedConversationIds: [], collapsedProjectIds: [] });

    expect(result.nextProjects).toEqual([]);
    expect(result.nextConversations).toEqual([]);
  });

  it("moves pinned conversations first and restores activity order after unpinning", () => {
    const conversations = [
      { id: "a", projectId: "demo", title: "A", preview: "", time: "", modifiedAt: "2026-08-28T08:00:00.000Z" },
      { id: "b", projectId: "demo", title: "B", preview: "", time: "", modifiedAt: "2026-08-27T08:00:00.000Z" },
      { id: "c", projectId: "demo", title: "C", preview: "", time: "", modifiedAt: "2026-08-26T08:00:00.000Z" },
    ];

    const pinned = sortConversationsByPinned(conversations, ["c"]);
    expect(pinned.map((item) => item.id)).toEqual(["c", "a", "b"]);
    expect(sortConversationsByPinned(pinned, []).map((item) => item.id)).toEqual(["a", "b", "c"]);
  });
});
