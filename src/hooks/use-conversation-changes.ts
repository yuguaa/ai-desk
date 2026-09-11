import { useEffect, useMemo, useRef, useState } from "react";
import type { Attachment } from "@/lib/attachments";
import {
  areConversationStatusesEqual,
  getConversationChanges,
  getConversationTurnFingerprint,
  getConversationTurnKey,
  loadConversationTurnChanges,
  retainConversationTurnChanges,
  saveConversationTurnChanges,
  type ConversationTurnChanges,
} from "@/lib/conversation-changes";
import {
  captureGitSnapshot,
  getGitSnapshotStatus,
  getGitSnapshotStatusBetween,
  getGitSnapshotStatusScoped,
  releaseGitSnapshot,
  revertGitSnapshot,
} from "@/lib/workspace-bridge";

type TurnStart = {
  cwd: string;
  conversationId: string;
  turnIndex: number;
  prompt: string;
  attachments?: Attachment[];
};

const RUNNING_REFRESH_INTERVAL = 2_000;

export function useConversationChanges(cwd: string, sessionId: string, activeTurnIndexes: Record<string, number>) {
  const [changes, setChanges] = useState(loadConversationTurnChanges);
  const changesRef = useRef(changes);
  const requestVersionsRef = useRef(new Map<string, number>());
  const settlingRef = useRef(new Map<string, Promise<void>>());
  const refreshingRef = useRef(new Set<string>());
  const revertingRef = useRef(new Set<string>());
  const mountedRef = useRef(true);

  useEffect(() => {
    changesRef.current = changes;
  }, [changes]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    Object.entries(changesRef.current)
      .filter(([, entry]) => entry.phase === "running")
      .filter(([, entry]) => activeTurnIndexes[entry.conversationId] !== entry.turnIndex)
      .forEach(([key, entry]) => settleEntry(key, entry));
  }, [activeTurnIndexes]);

  const changesByTurn = useMemo(() => Object.fromEntries(
    Object.values(changes)
      .filter((entry) => entry.cwd === cwd && entry.conversationId === sessionId)
      .map((entry) => [entry.turnIndex, entry]),
  ), [changes, cwd, sessionId]);

  const activeRunningTurnKeys = useMemo(() => Object.entries(changes)
    .filter(([, entry]) => entry.phase === "running" && activeTurnIndexes[entry.conversationId] === entry.turnIndex)
    .map(([key]) => key)
    .sort(), [activeTurnIndexes, changes]);
  const activeRunningTurnSignature = activeRunningTurnKeys.join("\n");

  useEffect(() => {
    if (!activeRunningTurnKeys.length) return;

    const refreshRunningTurns = () => activeRunningTurnKeys.forEach((key) => {
      const entry = changesRef.current[key];
      if (entry?.phase === "running") refreshEntry(key, entry);
    });

    refreshRunningTurns();
    const interval = window.setInterval(refreshRunningTurns, RUNNING_REFRESH_INTERVAL);
    return () => window.clearInterval(interval);
  }, [activeRunningTurnSignature]);

  const startTurn = ({ cwd: turnCwd, conversationId, turnIndex, prompt, attachments }: TurnStart) => Promise.all(
    Object.entries(changesRef.current)
      .filter(([, entry]) => entry.cwd === turnCwd && entry.conversationId === conversationId && entry.phase === "running" && entry.turnIndex !== turnIndex)
      .map(([key, entry]) => settleEntry(key, entry)),
  )
    /* 队列可在 React effect 前启动下一回合，先冻结上一回合再允许下一次执行。 */
    .then(() => captureGitSnapshot(turnCwd))
    .then((baselineTree) => {
      if (!baselineTree) throw new Error("无法建立本回合 Git 基线");
      const key = getConversationTurnKey(turnCwd, conversationId, turnIndex);
      commitEntry(key, {
        cwd: turnCwd,
        conversationId,
        turnIndex,
        promptFingerprint: getConversationTurnFingerprint(prompt, attachments),
        baselineTree,
        endTree: null,
        phase: "running",
        status: null,
      });
    });

  const refreshTurn = (turnIndex: number) => {
    const key = getConversationTurnKey(cwd, sessionId, turnIndex);
    const entry = changesRef.current[key];
    if (!entry) return;
    refreshCompletedTurn(key, entry);
  };

  const revertTurn = (turnIndex: number, path?: string) => {
    const key = getConversationTurnKey(cwd, sessionId, turnIndex);
    const entry = changesRef.current[key];
    if (!entry || !entry.endTree || revertingRef.current.has(entry.cwd)) return Promise.resolve(false);
    if (Object.values(changesRef.current).some((turn) => turn.cwd === entry.cwd && turn.phase === "running")) {
      commitEntry(key, { ...entry, error: "项目仍有任务执行中，请结束后再撤销" });
      return Promise.resolve(false);
    }
    if (path && !entry.status?.files.some((file) => file.path === path)) return Promise.resolve(false);
    revertingRef.current.add(entry.cwd);
    requestVersionsRef.current.set(key, (requestVersionsRef.current.get(key) ?? 0) + 1);
    const endTree = entry.endTree;
    const remainingPaths = (entry.status?.files ?? [])
      .map((file) => file.path)
      .filter((filePath) => path !== undefined && filePath !== path);
    /* 先计算冻结快照的剩余统计，避免撤销成功后统计失败而保留已撤销文件。 */
    return getGitSnapshotStatusScoped(entry.cwd, entry.baselineTree, endTree, remainingPaths)
      .then((status) => revertGitSnapshot(entry.cwd, entry.baselineTree, endTree, path ?? null).then(() => status))
      .then((status) => {
        commitEntry(key, { ...entry, error: undefined, status: getConversationChanges(status) });
        return true;
      })
      .catch((reason: unknown) => {
        commitEntry(key, { ...entry, error: String(reason) });
        return false;
      })
      .finally(() => revertingRef.current.delete(entry.cwd));
  };

  function refreshEntry(key: string, entry: ConversationTurnChanges) {
    /* 慢请求不叠加，收尾期间停止轮询，避免覆盖结束快照的版本。 */
    if (refreshingRef.current.has(key) || settlingRef.current.has(key)) return;
    refreshingRef.current.add(key);
    const requestVersion = (requestVersionsRef.current.get(key) ?? 0) + 1;
    requestVersionsRef.current.set(key, requestVersion);
    getGitSnapshotStatus(entry.cwd, entry.baselineTree)
      .then((status) => {
        if (!mountedRef.current || requestVersionsRef.current.get(key) !== requestVersion) return;
        const nextStatus = getConversationChanges(status);
        if (areConversationStatusesEqual(changesRef.current[key]?.status ?? null, nextStatus)) return;
        commitEntry(key, { ...entry, error: undefined, status: nextStatus });
      })
      .catch(() => undefined)
      .finally(() => refreshingRef.current.delete(key));
  }

  function refreshCompletedTurn(key: string, entry: ConversationTurnChanges) {
    if (!entry.endTree || refreshingRef.current.has(key) || revertingRef.current.has(entry.cwd)) return;
    refreshingRef.current.add(key);
    const requestVersion = (requestVersionsRef.current.get(key) ?? 0) + 1;
    requestVersionsRef.current.set(key, requestVersion);
    /* 刷新同样限定在本回合剩余变更范围内，避免把其他回合的变更混进来 */
    const paths = (entry.status?.files ?? []).map((file) => file.path);
    getGitSnapshotStatusScoped(entry.cwd, entry.baselineTree, entry.endTree, paths)
      .then((status) => {
        if (!mountedRef.current || requestVersionsRef.current.get(key) !== requestVersion) return;
        commitEntry(key, { ...entry, error: undefined, status: getConversationChanges(status) });
      })
      .catch((reason: unknown) => {
        if (requestVersionsRef.current.get(key) === requestVersion) commitEntry(key, { ...entry, error: String(reason) });
      })
      .finally(() => refreshingRef.current.delete(key));
  }

  function settleEntry(key: string, entry: ConversationTurnChanges) {
    const pending = settlingRef.current.get(key);
    if (pending) return pending;
    const requestVersion = (requestVersionsRef.current.get(key) ?? 0) + 1;
    requestVersionsRef.current.set(key, requestVersion);

    const request = captureGitSnapshot(entry.cwd)
      .then((endTree) => {
        if (!endTree) throw new Error("无法建立本回合结束快照");
        return getGitSnapshotStatusBetween(entry.cwd, entry.baselineTree, endTree)
          .then((status) => ({ endTree, status }));
      })
      .then(({ endTree, status }) => {
        if (!mountedRef.current || requestVersionsRef.current.get(key) !== requestVersion) return;
        commitEntry(key, {
          ...entry,
          phase: "completed",
          completedAt: Date.now(),
          endTree,
          error: undefined,
          status: getConversationChanges(status),
        });
      })
      .catch((reason: unknown) => {
        if (!mountedRef.current || requestVersionsRef.current.get(key) !== requestVersion) return;
        commitEntry(key, { ...entry, phase: "completed", completedAt: Date.now(), error: String(reason) });
      })
      .finally(() => settlingRef.current.delete(key));
    settlingRef.current.set(key, request);
    return request;
  }

  function commitEntry(key: string, entry: ConversationTurnChanges) {
    if (!mountedRef.current) return;
    const updated = { ...changesRef.current, [key]: entry };
    const next = entry.phase === "completed" ? retainConversationTurnChanges(updated) : updated;
    changesRef.current = next;
    setChanges(next);
    if (entry.phase === "completed") {
      saveConversationTurnChanges(updated).forEach(({ cwd: snapshotCwd, tree }) => {
        releaseGitSnapshot(snapshotCwd, tree).catch(() => undefined);
      });
    }
  }

  return { changesByTurn, startTurn, refreshTurn, revertTurn };
}
