import type { GitFileStatus, GitStatus } from "@/types/workspace";
import type { ImageAttachment } from "@/lib/image-attachments";

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
  error?: string;
  status: GitStatus | null;
};

const STORAGE_KEY = "ai-desk.conversation-turn-changes";
const MAX_PERSISTED_TURNS = 100;

export function getConversationTurnKey(cwd: string, conversationId: string, turnIndex: number) {
  return `${cwd}::${conversationId}::${turnIndex}`;
}

const imageFingerprints = new WeakMap<ImageAttachment, string>();

export function getConversationTurnFingerprint(prompt: string, images: ImageAttachment[] = []) {
  const textFingerprint = fingerprintText(prompt);
  if (!images.length) return textFingerprint;
  /* 图片对象在流式更新间不变，避免每个 token 都重新遍历 base64。 */
  return `${textFingerprint}:${images.map((image) => {
    let fingerprint = imageFingerprints.get(image);
    if (!fingerprint) {
      fingerprint = fingerprintText(`${image.mimeType}:${image.data}`);
      imageFingerprints.set(image, fingerprint);
    }
    return fingerprint;
  }).join(":")}`;
}

function fingerprintText(prompt: string) {
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

export function retainConversationTurnChanges(changes: Record<string, ConversationTurnChanges>) {
  const completed = Object.entries(changes)
    .filter(([, entry]) => entry.phase === "completed")
    .sort(([, left], [, right]) => (left.completedAt ?? 0) - (right.completedAt ?? 0));
  return Object.fromEntries([
    ...Object.entries(changes).filter(([, entry]) => entry.phase === "running"),
    ...completed.slice(-MAX_PERSISTED_TURNS),
  ]);
}

export function saveConversationTurnChanges(changes: Record<string, ConversationTurnChanges>) {
  if (typeof localStorage === "undefined") return [] as ReleasedSnapshot[];

  const completedEntries = Object.entries(changes)
    .filter(([, entry]) => entry.phase === "completed")
    .sort(([, left], [, right]) => (left.completedAt ?? 0) - (right.completedAt ?? 0));
  const retainedEntries = completedEntries.slice(-MAX_PERSISTED_TURNS);
  const snapshotKey = (cwd: string, tree: string) => JSON.stringify([cwd, tree]);
  /* 运行中的基线仍需保活，Git 对象 ID 也必须按仓库隔离。 */
  const retainedTrees = new Set(Object.values(retainConversationTurnChanges(changes))
    .flatMap((entry) => [entry.baselineTree, entry.endTree]
      .filter((tree): tree is string => Boolean(tree))
      .map((tree) => snapshotKey(entry.cwd, tree))));
  const released = completedEntries
    .slice(0, -MAX_PERSISTED_TURNS)
    .flatMap(([, entry]) => [
      { cwd: entry.cwd, tree: entry.baselineTree },
      ...(entry.endTree ? [{ cwd: entry.cwd, tree: entry.endTree }] : []),
    ])
    .filter(({ cwd, tree }) => !retainedTrees.has(snapshotKey(cwd, tree)))
    .filter((entry, index, entries) => entries.findIndex((other) => other.cwd === entry.cwd && other.tree === entry.tree) === index);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(retainedEntries)));
  } catch {
    /*
     * 统计持久化不能中断对话主流程，内存中的本轮结果仍然可正常展示。
     */
    return [] as ReleasedSnapshot[];
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

export function areConversationStatusesEqual(left: GitStatus | null, right: GitStatus | null) {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.branch === right.branch && left.clean === right.clean
    && left.additions === right.additions && left.deletions === right.deletions
    && left.files.length === right.files.length
    && left.files.every((file, index) => file.path === right.files[index].path && file.code === right.files[index].code);
}

function normalizeSnapshotFiles(files: GitFileStatus[]) {
  const normalizedFiles = new Map<string, GitFileStatus>();

  files.forEach((file) => {
    const path = file.path;
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
    error: typeof entry.error === "string" ? entry.error : undefined,
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
