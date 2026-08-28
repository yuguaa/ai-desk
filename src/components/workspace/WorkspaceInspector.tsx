import { FileCode, GitBranch } from "@/components/ui/icons";
import { FileExplorer } from "@/components/files/FileExplorer";
import { FilePreview } from "@/components/files/FilePreview";
import { GitPanel } from "@/components/git/GitPanel";
import { GitNoticeToast } from "@/components/git/GitNoticeToast";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { InspectorPreview } from "@/hooks/use-workspace-inspector";
import type { GitAction, GitStatus, WorkspaceFile } from "@/types/workspace";

export function WorkspaceInspector({ tab, files, gitStatus, preview, selectedPath, isLoading, error, gitOperation, gitNotice, onTabChange, onRefresh, onOpenFile, onOpenDiff, onClosePreview, onGitAction, onGitNoticeDismiss }: { tab: "files" | "git"; files: WorkspaceFile[]; gitStatus: GitStatus | null; preview: InspectorPreview | null; selectedPath: string | null; isLoading: boolean; error: string | null; gitOperation: string | null; gitNotice: string | null; onTabChange: (tab: "files" | "git") => void; onRefresh: () => void; onOpenFile: (path: string) => void; onOpenDiff: (path: string) => void; onClosePreview: () => void; onGitAction: (action: GitAction) => Promise<boolean>; onGitNoticeDismiss: () => void }) {
  const list = tab === "files"
    ? <FileExplorer files={files} selectedPath={selectedPath} isLoading={isLoading} onOpenFile={onOpenFile} onRefresh={onRefresh} />
    : <GitPanel status={gitStatus} selectedPath={selectedPath} isLoading={isLoading} error={error} operation={gitOperation} onRefresh={onRefresh} onOpenDiff={onOpenDiff} onGitAction={onGitAction} />;

  return <><aside className="flex h-full w-full min-w-0 flex-col bg-[var(--bg-sidebar)]"><Tabs value={tab} onValueChange={(value) => { if (value !== "files" && value !== "git") return; onClosePreview(); onTabChange(value); }} className="min-h-0 flex-1 gap-0"><div className="flex h-9 shrink-0 items-center border-b border-[var(--border-subtle)] px-[var(--container-padding-tight)]"><TabsList variant="line" className="h-9 gap-0 rounded-none bg-transparent p-0"><TabsTrigger value="files" className="h-9 flex-none rounded-none px-2 text-[var(--font-size-11)]"><FileCode size={13} data-icon="inline-start" />文件</TabsTrigger><TabsTrigger value="git" className="h-9 flex-none rounded-none px-2 text-[var(--font-size-11)]"><GitBranch size={13} data-icon="inline-start" />Git</TabsTrigger></TabsList></div><div className="min-h-0 flex-1 overflow-hidden">{preview ? <ResizablePanelGroup orientation="horizontal"><ResizablePanel id={`${tab}-list`} defaultSize="44%" minSize="24%" className="min-h-0 min-w-0 overflow-hidden">{list}</ResizablePanel><ResizableHandle aria-label="调整预览宽度" /><ResizablePanel id="preview" defaultSize="56%" minSize="30%" className="min-h-0 min-w-0 overflow-hidden"><FilePreview preview={preview} onClose={onClosePreview} /></ResizablePanel></ResizablePanelGroup> : list}</div></Tabs></aside><GitNoticeToast message={gitNotice} onDismiss={onGitNoticeDismiss} /></>;
}
