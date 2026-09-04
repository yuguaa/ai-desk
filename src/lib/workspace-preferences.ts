export type WorkspacePreferences = {
  projectRoots: string[];
  hiddenProjectRoots: string[];
  trustedProjectRoots: string[];
  archivedConversationIds: string[];
  pinnedConversationIds: string[];
  collapsedProjectIds: string[];
};

export const WORKSPACE_PREFERENCES_KEY = "ai-desk.workspace";

export const EMPTY_WORKSPACE_PREFERENCES: WorkspacePreferences = {
  projectRoots: [],
  hiddenProjectRoots: [],
  trustedProjectRoots: [],
  archivedConversationIds: [],
  pinnedConversationIds: [],
  collapsedProjectIds: [],
};

export function loadWorkspacePreferences(): WorkspacePreferences {
  if (typeof localStorage === "undefined") return EMPTY_WORKSPACE_PREFERENCES;
  try {
    const raw = localStorage.getItem(WORKSPACE_PREFERENCES_KEY);
    if (!raw) return EMPTY_WORKSPACE_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<WorkspacePreferences>;
    return {
      projectRoots: stringList(parsed.projectRoots).map(normalizeProjectPath),
      hiddenProjectRoots: stringList(parsed.hiddenProjectRoots).map(normalizeProjectPath),
      trustedProjectRoots: stringList(parsed.trustedProjectRoots).map(normalizeProjectPath),
      archivedConversationIds: stringList(parsed.archivedConversationIds),
      pinnedConversationIds: stringList(parsed.pinnedConversationIds),
      collapsedProjectIds: stringList(parsed.collapsedProjectIds),
    };
  } catch {
    return EMPTY_WORKSPACE_PREFERENCES;
  }
}

export function saveWorkspacePreferences(preferences: WorkspacePreferences) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(WORKSPACE_PREFERENCES_KEY, JSON.stringify(preferences));
}

export function addProjectPreference(preferences: WorkspacePreferences, path: string): WorkspacePreferences {
  const normalizedPath = normalizeProjectPath(path);
  return {
    ...preferences,
    projectRoots: stringList([...preferences.projectRoots, normalizedPath]),
    hiddenProjectRoots: preferences.hiddenProjectRoots.filter((currentPath) => currentPath !== normalizedPath),
  };
}

export function removeProjectPreference(preferences: WorkspacePreferences, path: string): WorkspacePreferences {
  const normalizedPath = normalizeProjectPath(path);
  return {
    ...preferences,
    projectRoots: preferences.projectRoots.filter((currentPath) => currentPath !== normalizedPath),
    hiddenProjectRoots: stringList([...preferences.hiddenProjectRoots, normalizedPath]),
  };
}

export function isProjectTrusted(preferences: WorkspacePreferences, path: string) {
  const normalizedPath = normalizeProjectPath(path);
  return preferences.trustedProjectRoots.includes(normalizedPath);
}

export function setProjectTrustedPreference(preferences: WorkspacePreferences, path: string, trusted: boolean): WorkspacePreferences {
  const normalizedPath = normalizeProjectPath(path);
  return {
    ...preferences,
    trustedProjectRoots: trusted
      ? stringList([...preferences.trustedProjectRoots, normalizedPath])
      : preferences.trustedProjectRoots.filter((currentPath) => currentPath !== normalizedPath),
  };
}

export function archiveConversationPreference(preferences: WorkspacePreferences, conversationId: string): WorkspacePreferences {
  return {
    ...preferences,
    archivedConversationIds: stringList([...preferences.archivedConversationIds, conversationId]),
    pinnedConversationIds: preferences.pinnedConversationIds.filter((id) => id !== conversationId),
  };
}

export function setConversationPinnedPreference(preferences: WorkspacePreferences, conversationId: string, pinned: boolean): WorkspacePreferences {
  return {
    ...preferences,
    pinnedConversationIds: pinned
      ? stringList([...preferences.pinnedConversationIds, conversationId])
      : preferences.pinnedConversationIds.filter((id) => id !== conversationId),
  };
}

export function setProjectCollapsedPreference(preferences: WorkspacePreferences, projectId: string, collapsed: boolean): WorkspacePreferences {
  return {
    ...preferences,
    collapsedProjectIds: collapsed
      ? stringList([...preferences.collapsedProjectIds, projectId])
      : preferences.collapsedProjectIds.filter((currentId) => currentId !== projectId),
  };
}

export function normalizeProjectPath(path: string) {
  const trimmed = path.trim();
  if (trimmed === "/" || /^[A-Za-z]:[\\/]$/.test(trimmed)) return trimmed;
  return trimmed.replace(/[\\/]+$/, "");
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0))];
}
