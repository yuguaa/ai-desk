import type { GitFileStatus, GitStatus } from "@/types/workspace";

export type ConversationSnapshotStatus = GitStatus;

export type ConversationTurnChanges = {
  cwd: string;
  conversationId: string;
  turnIndex: number;
  promptFingerprint: string;
  baselineTree: string;
  endTree: string | null;
  phase: "running" | "completed";
  completedAt?: number;
  status: GitStatus | null;
};

const STORAGE_KEY = "ai-desk.conversation-turn-changes";
const MAX_PERSISTED_TURNS = 100;

export function getConversationTurnKey(cwd: string, conversationId: string, turnIndex: number) {
  return `${cwd}::${conversationId}::${turnIndex}`;
}

export function getConversationTurnFingerprint(prompt: string) {
  let hash = 2166136261;
  for (let index = 0; index < prompt.length; index += 1) {
    hash ^= prompt.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prompt.length}:${(hash >>> 0).toString(36)}`;
}

export function loadConversationTurnChanges() {
  if (typeof localStorage === "undefined") return {} as Record<string, ConversationTurnChanges>;

  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as unknown;
    if (!value || typeof value !== "object") return {} as Record<string, ConversationTurnChanges>;

    return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
      const normalized = normalizeStoredTurnChanges(entry);
      return normalized ? [[key, normalized]] : [];
    }));
  } catch {
    return {} as Record<string, ConversationTurnChanges>;
  }
}

export type ReleasedSnapshot = { cwd: string; tree: string };

export function saveConversationTurnChanges(changes: Record<string, ConversationTurnChanges>) {
  if (typeof localStorage === "undefined") return [] as ReleasedSnapshot[];

  const completedEntries = Object.entries(changes)
    .filter(([, entry]) => entry.phase === "completed")
    .sort(([, left], [, right]) => (left.completedAt ?? 0) - (right.completedAt ?? 0));
  const retainedEntries = completedEntries.slice(-MAX_PERSISTED_TURNS);
  const retainedTrees = new Set(
    retainedEntries.flatMap(([, entry]) => [entry.baselineTree, entry.endTree].filter((tree): tree is string => Boolean(tree))),
  );
  const released = completedEntries
    .slice(0, -MAX_PERSISTED_TURNS)
    .flatMap(([, entry]) => [
      { cwd: entry.cwd, tree: entry.baselineTree },
      ...(entry.endTree ? [{ cwd: entry.cwd, tree: entry.endTree }] : []),
    ])
    .filter(({ tree }) => !retainedTrees.has(tree));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(retainedEntries)));
  } catch {
    /*
     * 统计持久化不能中断对话主流程，内存中的本轮结果仍然可正常展示。
     */
  }
  return released;
}

export function getConversationChanges(snapshotStatus: ConversationSnapshotStatus | null) {
  if (!snapshotStatus) return null;
  const files = normalizeSnapshotFiles(snapshotStatus.files);
  const additions = Math.max(0, snapshotStatus.additions);
  const deletions = Math.max(0, snapshotStatus.deletions);

  /*
   * snapshot command 已经按 baseline 给出结果。
   * 这里仅做去重和 clean 规范化，避免旧差分逻辑把恢复后的文件误判成删除。
   */
  if (snapshotStatus.clean || (!files.length && additions === 0 && deletions === 0)) return null;

  return {
    ...snapshotStatus,
    clean: false,
    additions,
    deletions,
    files,
  };
}

function normalizeSnapshotFiles(files: GitFileStatus[]) {
  const normalizedFiles = new Map<string, GitFileStatus>();

  files.forEach((file) => {
    const path = file.path.trim();
    if (!path) return;
    normalizedFiles.set(path, { path, code: file.code.trimEnd() || file.code });
  });

  return [...normalizedFiles.values()];
}

function normalizeStoredTurnChanges(value: unknown): ConversationTurnChanges | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<ConversationTurnChanges>;
  if (
    typeof entry.cwd !== "string"
    || typeof entry.conversationId !== "string"
    || typeof entry.turnIndex !== "number"
    || !Number.isInteger(entry.turnIndex)
    || entry.turnIndex < 0
    || typeof entry.promptFingerprint !== "string"
    || typeof entry.baselineTree !== "string"
    || entry.phase !== "completed"
  ) return null;

  const status = normalizeStoredStatus(entry.status);
  if (entry.status !== null && !status) return null;
  const endTree = typeof entry.endTree === "string" ? entry.endTree : null;

  return {
    cwd: entry.cwd,
    conversationId: entry.conversationId,
    turnIndex: entry.turnIndex,
    promptFingerprint: entry.promptFingerprint,
    baselineTree: entry.baselineTree,
    endTree,
    phase: "completed",
    completedAt: typeof entry.completedAt === "number" && Number.isFinite(entry.completedAt) ? entry.completedAt : undefined,
    status: getConversationChanges(status),
  };
}

function normalizeStoredStatus(value: unknown): GitStatus | null {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object") return null;
  const status = value as Partial<GitStatus>;
  if (
    typeof status.branch !== "string"
    || typeof status.clean !== "boolean"
    || typeof status.additions !== "number"
    || !Number.isFinite(status.additions)
    || typeof status.deletions !== "number"
    || !Number.isFinite(status.deletions)
    || !Array.isArray(status.files)
    || status.files.some((file) => !file || typeof file.path !== "string" || typeof file.code !== "string")
  ) return null;

  return {
    branch: status.branch,
    clean: status.clean,
    additions: status.additions,
    deletions: status.deletions,
    files: status.files,
  };
}
