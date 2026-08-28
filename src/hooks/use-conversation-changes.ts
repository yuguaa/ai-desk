import { useEffect, useMemo, useRef, useState } from "react";
import {
  getConversationChanges,
  getConversationTurnFingerprint,
  getConversationTurnKey,
  loadConversationTurnChanges,
  saveConversationTurnChanges,
  type ConversationTurnChanges,
} from "@/lib/conversation-changes";
import { captureGitSnapshot, getGitSnapshotStatus, releaseGitSnapshot } from "@/lib/workspace-bridge";

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
        phase: "running",
        status: null,
      });
    });

  const refreshTurn = (turnIndex: number) => {
    const entry = changesByTurn[turnIndex];
    if (!entry) return;
    refreshEntry(getConversationTurnKey(entry.cwd, entry.conversationId, entry.turnIndex), entry);
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

  function settleEntry(key: string, entry: ConversationTurnChanges) {
    if (settlingRef.current.has(key)) return;
    settlingRef.current.add(key);
    const requestVersion = (requestVersionsRef.current.get(key) ?? 0) + 1;
    requestVersionsRef.current.set(key, requestVersion);

    getGitSnapshotStatus(entry.cwd, entry.baselineTree)
      .then((status) => {
        if (!mountedRef.current || requestVersionsRef.current.get(key) !== requestVersion) return;
        commitEntry(key, { ...entry, phase: "completed", completedAt: Date.now(), status: getConversationChanges(status) });
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
      saveConversationTurnChanges(next).forEach((evicted) => {
        releaseGitSnapshot(evicted.cwd, evicted.baselineTree).catch(() => undefined);
      });
    }
  }

  return { changesByTurn, startTurn, refreshTurn };
}
