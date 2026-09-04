import { useEffect, useMemo, useRef, useState } from "react";
import {
  getConversationChanges,
  getConversationTurnFingerprint,
  getConversationTurnKey,
  loadConversationTurnChanges,
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
};

const RUNNING_REFRESH_INTERVAL = 2_000;

export function useConversationChanges(cwd: string, sessionId: string, activeTurnIndexes: Record<string, number>) {
  const [changes, setChanges] = useState(loadConversationTurnChanges);
  const changesRef = useRef(changes);
  const requestVersionsRef = useRef(new Map<string, number>());
  const settlingRef = useRef(new Set<string>());
  const mountedRef = useRef(true);

  useEffect(() => {
    changesRef.current = changes;
  }, [changes]);

  useEffect(() => {
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

  const startTurn = ({ cwd: turnCwd, conversationId, turnIndex, prompt }: TurnStart) => captureGitSnapshot(turnCwd)
    .then((baselineTree) => {
      if (!baselineTree) throw new Error("无法建立本回合 Git 基线");
      const key = getConversationTurnKey(turnCwd, conversationId, turnIndex);
      commitEntry(key, {
        cwd: turnCwd,
        conversationId,
        turnIndex,
        promptFingerprint: getConversationTurnFingerprint(prompt),
        baselineTree,
        endTree: null,
        phase: "running",
        status: null,
      });
    });

  const refreshTurn = (turnIndex: number) => {
    const entry = changesByTurn[turnIndex];
    if (!entry) return;
    refreshCompletedTurn(getConversationTurnKey(entry.cwd, entry.conversationId, entry.turnIndex), entry);
  };

  const revertTurn = (turnIndex: number, path?: string) => {
    const entry = changesByTurn[turnIndex];
    if (!entry || !entry.endTree) return Promise.resolve(false);
    const endTree = entry.endTree;
    const key = getConversationTurnKey(entry.cwd, entry.conversationId, entry.turnIndex);
    const remainingPaths = (entry.status?.files ?? [])
      .map((file) => file.path)
      .filter((filePath) => filePath !== path);
    return revertGitSnapshot(entry.cwd, entry.baselineTree, endTree, path ?? null)
      .then(() => getGitSnapshotStatusScoped(entry.cwd, entry.baselineTree, endTree, remainingPaths))
      .then((status) => {
        commitEntry(key, { ...entry, status: getConversationChanges(status) });
        return true;
      })
      .catch(() => false);
  };

  function refreshEntry(key: string, entry: ConversationTurnChanges) {
    const requestVersion = (requestVersionsRef.current.get(key) ?? 0) + 1;
    requestVersionsRef.current.set(key, requestVersion);
    getGitSnapshotStatus(entry.cwd, entry.baselineTree)
      .then((status) => {
        if (!mountedRef.current || requestVersionsRef.current.get(key) !== requestVersion) return;
        commitEntry(key, { ...entry, status: getConversationChanges(status) });
      })
      .catch(() => undefined);
  }

  function refreshCompletedTurn(key: string, entry: ConversationTurnChanges) {
    if (!entry.endTree) return;
    const requestVersion = (requestVersionsRef.current.get(key) ?? 0) + 1;
    requestVersionsRef.current.set(key, requestVersion);
    /* 刷新同样限定在本回合剩余变更范围内，避免把其他回合的变更混进来 */
    const paths = (entry.status?.files ?? []).map((file) => file.path);
    getGitSnapshotStatusScoped(entry.cwd, entry.baselineTree, entry.endTree, paths)
      .then((status) => {
        if (!mountedRef.current || requestVersionsRef.current.get(key) !== requestVersion) return;
        commitEntry(key, { ...entry, status: getConversationChanges(status) });
      })
      .catch(() => undefined);
  }

  function settleEntry(key: string, entry: ConversationTurnChanges) {
    if (settlingRef.current.has(key)) return;
    settlingRef.current.add(key);
    const requestVersion = (requestVersionsRef.current.get(key) ?? 0) + 1;
    requestVersionsRef.current.set(key, requestVersion);

    captureGitSnapshot(entry.cwd)
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
          status: getConversationChanges(status),
        });
      })
      .catch(() => {
        if (!mountedRef.current || requestVersionsRef.current.get(key) !== requestVersion) return;
        commitEntry(key, { ...entry, phase: "completed", completedAt: Date.now() });
      })
      .finally(() => settlingRef.current.delete(key));
  }

  function commitEntry(key: string, entry: ConversationTurnChanges) {
    const next = { ...changesRef.current, [key]: entry };
    changesRef.current = next;
    setChanges(next);
    if (entry.phase === "completed") {
      saveConversationTurnChanges(next).forEach(({ cwd: snapshotCwd, tree }) => {
        releaseGitSnapshot(snapshotCwd, tree).catch(() => undefined);
      });
    }
  }

  return { changesByTurn, startTurn, refreshTurn, revertTurn };
}
