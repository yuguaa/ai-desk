import { afterEach, describe, expect, it, vi } from "vitest";
import { addProjectPreference, archiveConversationPreference, isProjectTrusted, loadWorkspacePreferences, normalizeProjectPath, removeProjectPreference, setConversationPinnedPreference, setProjectCollapsedPreference, setProjectTrustedPreference, WORKSPACE_PREFERENCES_KEY } from "@/lib/workspace-preferences";

afterEach(() => vi.unstubAllGlobals());

describe("workspace preferences", () => {
  it("loads persisted project roots and archived conversations", () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => key === WORKSPACE_PREFERENCES_KEY ? JSON.stringify({ projectRoots: ["/code/demo/", "/code/demo/"], trustedProjectRoots: ["/code/demo/", "/code/demo/"], archivedConversationIds: ["session-a", "session-a"], pinnedConversationIds: ["session-b", "session-b"] }) : null,
    });

    expect(loadWorkspacePreferences()).toEqual({ projectRoots: ["/code/demo"], hiddenProjectRoots: [], trustedProjectRoots: ["/code/demo"], archivedConversationIds: ["session-a"], pinnedConversationIds: ["session-b"], collapsedProjectIds: [] });
  });

  it("默认折叠项目并持久化折叠状态", () => {
    const initial = { projectRoots: ["/code/demo"], hiddenProjectRoots: [], trustedProjectRoots: [], archivedConversationIds: [], pinnedConversationIds: [], collapsedProjectIds: [] };

    expect(loadWorkspacePreferences()).toEqual({ ...initial, projectRoots: [], hiddenProjectRoots: [] });

    const collapsed = setProjectCollapsedPreference(initial, "/code/demo", true);
    const expanded = setProjectCollapsedPreference(collapsed, "/code/demo", false);

    expect(collapsed.collapsedProjectIds).toEqual(["/code/demo"]);
    expect(expanded.collapsedProjectIds).toEqual([]);
  });

  it("migrates legacy storage with projects untrusted by default", () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => key === WORKSPACE_PREFERENCES_KEY ? JSON.stringify({ projectRoots: ["/code/demo/"], archivedConversationIds: ["session-a"], pinnedConversationIds: [], collapsedProjectIds: [] }) : null,
    });

    const preferences = loadWorkspacePreferences();

    expect(preferences.trustedProjectRoots).toEqual([]);
    expect(isProjectTrusted(preferences, "/code/demo")).toBe(false);
  });

  it("deduplicates projects, keeps trust preference and pin/archive state consistent", () => {
    const initial = { projectRoots: ["/code/demo"], hiddenProjectRoots: [], trustedProjectRoots: [], archivedConversationIds: ["session-a"], pinnedConversationIds: [], collapsedProjectIds: [] };
    const withProject = addProjectPreference(initial, "/code/demo/");
    const trusted = setProjectTrustedPreference(withProject, "/code/demo/", true);
    const pinned = setConversationPinnedPreference(withProject, "session-b", true);
    const archived = archiveConversationPreference(pinned, "session-b");
    const untrusted = setProjectTrustedPreference(trusted, "/code/demo/", false);

    expect(trusted).toEqual({ projectRoots: ["/code/demo"], hiddenProjectRoots: [], trustedProjectRoots: ["/code/demo"], archivedConversationIds: ["session-a"], pinnedConversationIds: [], collapsedProjectIds: [] });
    expect(isProjectTrusted(trusted, "/code/demo")).toBe(true);
    expect(untrusted.trustedProjectRoots).toEqual([]);
    expect(archived).toEqual({ projectRoots: ["/code/demo"], hiddenProjectRoots: [], trustedProjectRoots: [], archivedConversationIds: ["session-a", "session-b"], pinnedConversationIds: [], collapsedProjectIds: [] });
    expect(normalizeProjectPath("C:\\")).toBe("C:\\");
  });

  it("从展示中移除项目，并在重新添加时恢复显示", () => {
    const initial = { projectRoots: ["/code/demo"], hiddenProjectRoots: [], trustedProjectRoots: ["/code/demo"], archivedConversationIds: [], pinnedConversationIds: [], collapsedProjectIds: [] };
    const removed = removeProjectPreference(initial, "/code/demo/");
    const restored = addProjectPreference(removed, "/code/demo/");

    expect(removed.projectRoots).toEqual([]);
    expect(removed.hiddenProjectRoots).toEqual(["/code/demo"]);
    expect(removed.trustedProjectRoots).toEqual(["/code/demo"]);
    expect(restored.projectRoots).toEqual(["/code/demo"]);
    expect(restored.hiddenProjectRoots).toEqual([]);
  });
});
