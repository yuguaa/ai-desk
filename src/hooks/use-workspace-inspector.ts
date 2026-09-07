import { useCallback, useEffect, useRef, useState } from "react";
import { getGitDiff, getGitSnapshotDiff, getGitSnapshotDiffBetween, getGitStatus, listWorkspaceFiles, listenWorkspaceChanges, readWorkspaceFile, runGitAction as executeGitAction, startWorkspaceWatch, stopWorkspaceWatch } from "@/lib/workspace-bridge";
import type { FilePreview, GitAction, GitStatus, WorkspaceFile } from "@/types/workspace";

export type InspectorPreview =
  | (Exclude<FilePreview, { kind: "pagedText" }> & { mode: "file" })
  | (Extract<FilePreview, { kind: "pagedText" }> & { mode: "file"; cwd: string })
  | (Extract<FilePreview, { kind: "text" }> & { mode: "diff" });

type InspectorSession = {
  cwd: string;
  active: boolean;
  previewRequest: number;
  timer?: ReturnType<typeof setTimeout>;
};

const EVENT_DEBOUNCE_MS = 100;

export function useWorkspaceInspector(cwd: string) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [preview, setPreview] = useState<InspectorPreview | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gitOperation, setGitOperation] = useState<string | null>(null);
  const [gitNotice, setGitNotice] = useState<string | null>(null);
  const sessionRef = useRef<InspectorSession | null>(null);
  const flightRef = useRef<Promise<void> | null>(null);
  const pendingRef = useRef<InspectorSession | null>(null);

  const drainWorkspace = useCallback(function drain(): Promise<void> {
    const session = pendingRef.current;
    pendingRef.current = null;
    if (!session?.active) return Promise.resolve();
    setError(null);
    return Promise.allSettled([listWorkspaceFiles(session.cwd), getGitStatus(session.cwd)])
      .then(([filesResult, gitResult]) => {
        if (!session.active) return;
        setFiles(filesResult.status === "fulfilled" ? filesResult.value : []);
        setGitStatus(gitResult.status === "fulfilled" ? gitResult.value : null);
        const rejected = [filesResult, gitResult].find((result) => result.status === "rejected");
        if (rejected?.status === "rejected") {
          const reason = rejected.reason;
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .then(() => {
        /* 整个 hook 只保留一个在途批次和一个尾随标记，切换目录也不叠加请求。 */
        if (pendingRef.current?.active) return drain();
        flightRef.current = null;
        if (session.active) setIsLoading(false);
      });
  }, []);

  const loadWorkspace = useCallback((clearSelection: boolean) => {
    const session = sessionRef.current;
    if (!session?.active || session.cwd !== cwd) return Promise.resolve();
    clearTimeout(session.timer);
    session.timer = undefined;
    if (!cwd) {
      setFiles([]);
      setGitStatus(null);
      setPreview(null);
      setSelectedPath(null);
      setError(null);
      setIsLoading(false);
      return Promise.resolve();
    }
    setIsLoading(true);
    setError(null);
    setGitNotice(null);
    if (clearSelection) {
      session.previewRequest += 1;
      setPreview(null);
      setSelectedPath(null);
    }
    pendingRef.current = session;
    if (!flightRef.current) {
      flightRef.current = drainWorkspace();
    }
    return flightRef.current;
  }, [cwd, drainWorkspace]);

  const refresh = useCallback(() => loadWorkspace(true), [loadWorkspace]);
  const syncWorkspace = useCallback(() => loadWorkspace(false), [loadWorkspace]);

  useEffect(() => {
    const session: InspectorSession = { cwd, active: true, previewRequest: 0 };
    sessionRef.current = session;
    setGitOperation(null);
    setGitNotice(null);
    refresh();
    return () => {
      session.active = false;
      clearTimeout(session.timer);
      if (pendingRef.current === session) pendingRef.current = null;
    };
  }, [cwd, refresh]);

  useEffect(() => {
    if (!cwd) {
      stopWorkspaceWatch().catch(() => undefined);
      return undefined;
    }
    let unlisten: (() => void) | undefined;
    let stopped = false;
    const session = sessionRef.current!;
    startWorkspaceWatch(cwd)
      .catch(() => undefined)
      .then(() => {
        if (stopped) return undefined;
        return listenWorkspaceChanges((payload) => {
          if (stopped || !session.active || payload.cwd !== cwd) return;
          if (flightRef.current) {
            syncWorkspace();
            return;
          }
          clearTimeout(session.timer);
          session.timer = setTimeout(() => {
            session.timer = undefined;
            if (session.active) syncWorkspace();
          }, EVENT_DEBOUNCE_MS);
        });
      })
      .then((dispose) => {
        if (stopped) dispose?.();
        else unlisten = dispose;
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
      unlisten?.();
    };
  }, [cwd, syncWorkspace]);

  useEffect(() => () => {
    stopWorkspaceWatch().catch(() => undefined);
  }, []);

  const openFile = (path: string) => {
    const session = sessionRef.current;
    if (!session?.active || session.cwd !== cwd) return;
    const requestId = ++session.previewRequest;
    setError(null);
    setSelectedPath(path);
    readWorkspaceFile(cwd, path)
      .then((nextPreview) => {
        if (session.active && requestId === session.previewRequest && nextPreview) {
          setPreview(nextPreview.kind === "pagedText" ? { ...nextPreview, mode: "file", cwd } : { ...nextPreview, mode: "file" });
        }
      })
      .catch((reason) => {
        if (session.active && requestId === session.previewRequest) setError(reason instanceof Error ? reason.message : String(reason));
      });
  };

  const openDiff = (path: string, baselineTree?: string, endTree?: string) => {
    const session = sessionRef.current;
    if (!session?.active || session.cwd !== cwd) return;
    const requestId = ++session.previewRequest;
    setSelectedPath(path);
    const request = baselineTree && endTree
      ? getGitSnapshotDiffBetween(cwd, baselineTree, endTree, path)
      : baselineTree
        ? getGitSnapshotDiff(cwd, baselineTree, path)
        : getGitDiff(cwd, path);
    request
      .then((content) => {
        if (session.active && requestId === session.previewRequest) setPreview({ kind: "text", path, language: "diff", content, mode: "diff" });
      })
      .catch((reason) => {
        if (session.active && requestId === session.previewRequest) setError(reason instanceof Error ? reason.message : String(reason));
      });
  };

  const closePreview = () => {
    if (sessionRef.current) sessionRef.current.previewRequest += 1;
    setPreview(null);
    setSelectedPath(null);
  };

  const dismissGitNotice = useCallback(() => setGitNotice(null), []);

  const runGitAction = (action: GitAction) => {
    const session = sessionRef.current;
    if (!session?.active || session.cwd !== cwd) return Promise.resolve(false);
    const operation = gitActionKey(action);
    setGitOperation(operation);
    setError(null);
    setGitNotice(null);
    return executeGitAction(cwd, action)
      .then(() => { if (session.active) return refresh(); })
      .then(() => {
        if (!session.active) return false;
        setGitNotice(gitActionSuccessMessage(action));
        return true;
      })
      .catch((reason) => {
        if (session.active) setError(reason instanceof Error ? reason.message : String(reason));
        return false;
      })
      .finally(() => { if (session.active) setGitOperation(null); });
  };

  return {
    files,
    gitStatus,
    preview,
    selectedPath,
    isLoading,
    error,
    gitOperation,
    gitNotice,
    dismissGitNotice,
    refresh,
    openFile,
    openDiff,
    closePreview,
    runGitAction,
  };
}

function gitActionKey(action: GitAction) {
  return "path" in action ? `${action.type}:${action.path}` : action.type;
}

function gitActionSuccessMessage(action: GitAction) {
  if (action.type === "stageAll") return "已暂存全部变更";
  if (action.type === "unstageAll") return "已取消全部暂存";
  if (action.type === "stageFile") return `已暂存 ${action.path}`;
  if (action.type === "unstageFile") return `已取消暂存 ${action.path}`;
  if (action.type === "commit") return "提交成功";
  if (action.type === "pull") return "拉取完成";
  return "推送完成";
}
