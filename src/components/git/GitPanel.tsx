import { useState, type FormEvent, type ReactElement } from "react";
import { ArrowUp, Diff, Download, GitBranch, GitCommitHorizontal, Minus, Plus, RefreshCw } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FileTypeIcon } from "@/components/files/FileTypeIcon";
import type { GitAction, GitFileStatus, GitStatus } from "@/types/workspace";
import { cn } from "@/lib/utils";

export function GitPanel({ status, selectedPath, isLoading, error, operation, onRefresh, onOpenDiff, onGitAction }: {
  status: GitStatus | null;
  selectedPath: string | null;
  isLoading: boolean;
  error: string | null;
  operation: string | null;
  onRefresh: () => void;
  onOpenDiff: (path: string) => void;
  onGitAction: (action: GitAction) => Promise<boolean>;
}) {
  const [commitMessage, setCommitMessage] = useState("");
  if (isLoading && !status) return <div className="flex h-full items-center justify-center gap-2 text-[var(--font-size-11)] text-[var(--text-tertiary)]"><Spinner className="size-3.5" />读取 Git 状态…</div>;
  if (error && !status) return <div className="p-[var(--container-padding)]"><Alert variant="destructive"><AlertDescription><p>{error}</p><Button type="button" variant="outline" size="xs" onClick={onRefresh}><RefreshCw className="size-3" />重试</Button></AlertDescription></Alert></div>;
  if (!status) return <Empty className="h-full rounded-none border-0"><EmptyHeader><EmptyDescription className="text-[var(--font-size-11)]">当前目录不是 Git 仓库。</EmptyDescription></EmptyHeader></Empty>;

  const busy = operation !== null;
  const stagedFiles = status.files.filter((file) => hasIndexChange(file.code));
  const unstagedFiles = status.files.filter((file) => hasWorktreeChange(file.code));
  const submitCommit = (event: FormEvent) => {
    event.preventDefault();
    const message = commitMessage.trim();
    if (!message || !stagedFiles.length || busy) return;
    onGitAction({ type: "commit", message }).then((succeeded) => {
      if (succeeded) setCommitMessage("");
    });
  };

  return <div className="flex h-full min-h-0 flex-col">
    <div className="shrink-0 border-b border-[var(--border-subtle)]">
      <div className="flex h-9 items-center gap-1 border-b border-[var(--border-subtle)] px-[var(--container-padding-tight)]">
        <GitBranch className="size-4 shrink-0 text-[var(--accent)]" />
        <span className="min-w-0 flex-1 truncate font-mono text-[var(--font-size-11)] text-[var(--text-primary)]">{status.branch}</span>
        <span className="shrink-0 font-mono text-[var(--font-size-9)] text-[var(--text-tertiary)]"><span className="text-[var(--success)]">+{status.additions}</span> / <span className="text-[var(--error)]">-{status.deletions}</span></span>
        <GitActionButton label="拉取（仅快进）" disabled={busy} loading={operation === "pull"} onClick={() => {
          if (window.confirm(`确认拉取 ${status.branch}？仅允许快进更新。`)) onGitAction({ type: "pull" });
        }}><Download /></GitActionButton>
        <GitActionButton label="推送当前分支" disabled={busy} loading={operation === "push"} onClick={() => {
          if (window.confirm(`确认推送 ${status.branch}？`)) onGitAction({ type: "push" });
        }}><ArrowUp /></GitActionButton>
        <GitActionButton label="刷新 Git 状态" disabled={busy} loading={isLoading} onClick={onRefresh}><RefreshCw /></GitActionButton>
      </div>
      <form className="flex gap-1 p-[var(--container-padding-tight)]" onSubmit={submitCommit}>
        <Input value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} disabled={busy} placeholder={stagedFiles.length ? "提交信息" : "请先暂存变更"} aria-label="Git 提交信息" className="h-7 text-[var(--font-size-11)]" />
        <Button type="submit" size="icon-xs" disabled={busy || !stagedFiles.length || !commitMessage.trim()} aria-label="提交暂存的变更" title="提交"><GitCommitHorizontal /></Button>
      </form>
      {error && <div className="border-t border-[var(--border-subtle)] bg-[var(--error-tint)] px-2 py-1.5 text-[var(--font-size-10-5)] text-[var(--error)]" role="alert">{error}</div>}
    </div>
    <ScrollArea className="panel-scroll-area min-h-0 flex-1">
      <div className="min-w-0 py-1">
        {stagedFiles.length > 0 && <GitFileSection title="已暂存的更改" files={stagedFiles} selectedPath={selectedPath} operation={operation} disabled={busy} actionType="unstageFile" actionIcon={<Minus />} actionLabel="取消暂存" statusColumn="index" onOpenDiff={onOpenDiff} onGitAction={onGitAction} headerAction={<GitActionButton label="取消全部暂存" disabled={busy} loading={operation === "unstageAll"} onClick={() => onGitAction({ type: "unstageAll" })}><Minus /></GitActionButton>} />}
        {unstagedFiles.length > 0 && <GitFileSection title="未暂存的更改" files={unstagedFiles} selectedPath={selectedPath} operation={operation} disabled={busy} actionType="stageFile" actionIcon={<Plus />} actionLabel="暂存" statusColumn="worktree" onOpenDiff={onOpenDiff} onGitAction={onGitAction} headerAction={<GitActionButton label="暂存全部" disabled={busy} loading={operation === "stageAll"} onClick={() => onGitAction({ type: "stageAll" })}><Plus /></GitActionButton>} />}
        {!stagedFiles.length && !unstagedFiles.length && <Empty className="gap-2 rounded-none border-0 px-3 py-10"><EmptyHeader><EmptyMedia><GitCommitHorizontal className="size-5 text-[var(--success)]" /></EmptyMedia><EmptyDescription className="text-[var(--font-size-11)]">工作区干净</EmptyDescription></EmptyHeader></Empty>}
      </div>
    </ScrollArea>
  </div>;
}

function GitFileSection({ title, files, selectedPath, operation, disabled, actionType, actionIcon, actionLabel, statusColumn, onOpenDiff, onGitAction, headerAction }: { title: string; files: GitFileStatus[]; selectedPath: string | null; operation: string | null; disabled: boolean; actionType: "stageFile" | "unstageFile"; actionIcon: ReactElement; actionLabel: string; statusColumn: "index" | "worktree"; onOpenDiff: (path: string) => void; onGitAction: (action: GitAction) => Promise<boolean>; headerAction: ReactElement }) {
  return <section className="border-b border-[var(--border-subtle)] last:border-b-0">
    <div className="flex h-7 items-center gap-1 px-[var(--container-padding-tight)] text-[var(--font-size-10)] font-medium text-[var(--text-tertiary)]">
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <span className="font-mono tabular-nums">{files.length}</span>
      {headerAction}
    </div>
    <div className="px-[var(--container-padding-tight)] pb-[var(--container-padding-tight)]">{files.map((file) => <GitFileRow key={`${actionType}-${file.path}`} file={file} selected={selectedPath === file.path} operation={operation} disabled={disabled} actionType={actionType} actionIcon={actionIcon} actionLabel={`${actionLabel} ${file.path}`} statusColumn={statusColumn} onOpenDiff={onOpenDiff} onGitAction={onGitAction} />)}</div>
  </section>;
}

function GitFileRow({ file, selected, operation, disabled, actionType, actionIcon, actionLabel, statusColumn, onOpenDiff, onGitAction }: { file: GitFileStatus; selected: boolean; operation: string | null; disabled: boolean; actionType: "stageFile" | "unstageFile"; actionIcon: ReactElement; actionLabel: string; statusColumn: "index" | "worktree"; onOpenDiff: (path: string) => void; onGitAction: (action: GitAction) => Promise<boolean> }) {
  const action: GitAction = { type: actionType, path: file.path };
  const actionKey = `${action.type}:${file.path}`;
  const displayCode = statusColumn === "index" ? file.code[0] : file.code === "??" ? "U" : file.code[1];

  return <div className={cn("group flex min-h-8 min-w-0 items-center overflow-hidden rounded-[var(--radius-sm)] transition-[background-color,color]", selected ? "bg-[var(--accent-tint)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]")}>
    <Button type="button" variant="ghost" aria-current={selected ? "true" : undefined} className="min-h-8 min-w-0 flex-1 shrink justify-start gap-2 overflow-hidden rounded-none px-2 text-left text-[var(--font-size-11)] font-normal text-inherit hover:bg-transparent hover:text-inherit active:scale-100" onClick={() => onOpenDiff(file.path)} title={file.path}>
      <span className={cn("w-3 shrink-0 text-center font-mono text-[var(--font-size-10)] font-semibold", statusTone(displayCode))}>{displayCode}</span>
      <FileTypeIcon name={file.path} size={14} />
      <span className="min-w-0 flex-1 truncate">{file.path}</span>
      <Diff className="size-3 text-[var(--text-tertiary)]" />
    </Button>
    <GitActionButton label={actionLabel} disabled={disabled} loading={operation === actionKey} onClick={() => onGitAction(action)}>{actionIcon}</GitActionButton>
  </div>;
}

function GitActionButton({ label, disabled, loading, onClick, children }: { label: string; disabled?: boolean; loading?: boolean; onClick: () => void; children: ReactElement }) {
  return <Tooltip>
    <TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-xs" disabled={disabled} onClick={onClick} aria-label={label}>{loading ? <Spinner className="size-3" /> : children}</Button></TooltipTrigger>
    <TooltipContent side="top" sideOffset={6}>{label}</TooltipContent>
  </Tooltip>;
}

function hasIndexChange(code: string) {
  return code[0] !== " " && code[0] !== "?";
}

function hasWorktreeChange(code: string) {
  return code === "??" || code[1] !== " ";
}

function statusTone(code: string) {
  if (code === "U" || code === "A" || code === "?") return "text-[var(--success)]";
  if (code === "M" || code === "R" || code === "C") return "text-[var(--warning)]";
  return "text-[var(--error)]";
}
