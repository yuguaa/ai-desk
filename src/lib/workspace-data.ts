import type { PiProjectSummary } from "@/lib/pi-bridge";
import { EMPTY_WORKSPACE_PREFERENCES, normalizeProjectPath, type WorkspacePreferences } from "@/lib/workspace-preferences";
import type { ConversationRecord, Project } from "@/types/workspace";

export const EMPTY_PROJECT: Project = {
  id: "",
  name: "",
  path: "",
};

export function projectFromPath(path: string): Project {
  const normalizedPath = normalizeProjectPath(path);
  const name = normalizedPath.split(/[\\/]/).filter(Boolean).at(-1) ?? normalizedPath;
  return { id: normalizedPath, name, path: normalizedPath };
}

export function normalizePiProjects(items: PiProjectSummary[], preferences: WorkspacePreferences = EMPTY_WORKSPACE_PREFERENCES) {
  const hiddenProjects = new Set(preferences.hiddenProjectRoots.map(normalizeProjectPath));
  const visibleItems = items.filter((project) => !hiddenProjects.has(normalizeProjectPath(project.path)));
  const projectPaths = [...visibleItems.map((project) => normalizeProjectPath(project.path)), ...preferences.projectRoots.map(normalizeProjectPath).filter((path) => !hiddenProjects.has(path))];
  const nextProjects = [...new Set(projectPaths)].map(projectFromPath);
  const archived = new Set(preferences.archivedConversationIds);
  const nextConversations: ConversationRecord[] = visibleItems.flatMap((project) =>
    project.conversations.filter((conversation) => !archived.has(conversation.id)).map((conversation) => ({
      id: conversation.id,
      projectId: normalizeProjectPath(project.path),
      title: conversation.title,
      preview: conversation.preview,
      time: conversation.time,
      modifiedAt: conversation.modifiedAt,
      sessionFile: conversation.sessionFile,
    })),
  );
  return { nextProjects, nextConversations };
}

export function sortConversationsByPinned(conversations: ConversationRecord[], pinnedConversationIds: string[]) {
  const pinned = new Set(pinnedConversationIds);
  return conversations
    .map((conversation, index) => ({ conversation, index }))
    .sort((a, b) => Number(pinned.has(b.conversation.id)) - Number(pinned.has(a.conversation.id)) || compareModifiedAt(b.conversation.modifiedAt, a.conversation.modifiedAt) || a.index - b.index)
    .map(({ conversation }) => conversation);
}

function compareModifiedAt(left?: string, right?: string) {
  if (!left || !right) return 0;
  return left.localeCompare(right);
}
