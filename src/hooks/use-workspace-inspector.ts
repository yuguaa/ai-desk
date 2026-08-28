import { useCallback, useEffect, useState } from "react";
import { getGitDiff, getGitSnapshotDiff, getGitStatus, listWorkspaceFiles, readWorkspaceFile, runGitAction as executeGitAction } from "@/lib/workspace-bridge";
import type { FilePreview, GitAction, GitStatus, WorkspaceFile } from "@/types/workspace";

export type InspectorPreview =
  | (FilePreview & { mode: "file" })
  | (Extract<FilePreview, { kind: "text" }> & { mode: "diff" });

export function useWorkspaceInspector(cwd: string) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [preview, setPreview] = useState<InspectorPreview | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gitOperation, setGitOperation] = useState<string | null>(null);
  const [gitNotice, setGitNotice] = useState<string | null>(null);

  const refresh = () => {
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
    setPreview(null);
    setSelectedPath(null);
    return Promise.allSettled([listWorkspaceFiles(cwd), getGitStatus(cwd)])
      .then(([filesResult, gitResult]) => {
        if (filesResult.status === "fulfilled") setFiles(filesResult.value);
        else setFiles([]);
        if (gitResult.status === "fulfilled") setGitStatus(gitResult.value);
        else setGitStatus(null);
        const rejected = [filesResult, gitResult].find((result) => result.status === "rejected");
        if (rejected?.status === "rejected") {
          const reason = rejected.reason;
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    refresh();
  }, [cwd]);

  const openFile = (path: string) => {
    setSelectedPath(path);
    readWorkspaceFile(cwd, path)
      .then((nextPreview) => {
        if (nextPreview) setPreview({ ...nextPreview, mode: "file" });
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  };

  const openDiff = (path: string, baselineTree?: string) => {
    setSelectedPath(path);
    const request = baselineTree ? getGitSnapshotDiff(cwd, baselineTree, path) : getGitDiff(cwd, path);
    request
      .then((content) => setPreview({ kind: "text", path, language: "diff", content, mode: "diff" }))
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  };

  const closePreview = () => {
    setPreview(null);
    setSelectedPath(null);
  };

  const dismissGitNotice = useCallback(() => setGitNotice(null), []);

  const runGitAction = (action: GitAction) => {
    const operation = gitActionKey(action);
    setGitOperation(operation);
    setError(null);
    setGitNotice(null);
    return executeGitAction(cwd, action)
      .then(refresh)
      .then(() => {
        setGitNotice(gitActionSuccessMessage(action));
        return true;
      })
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : String(reason));
        return false;
      })
      .finally(() => setGitOperation(null));
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
