import { useState } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppTopbar } from "@/components/workspace/AppTopbar";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { WorkspaceInspector } from "@/components/workspace/WorkspaceInspector";
import { WorkspaceSidebar } from "@/components/workspace/WorkspaceSidebar";
import { useConversationChanges } from "@/hooks/use-conversation-changes";
import { useWorkspace } from "@/hooks/use-workspace";
import { useWorkspaceInspector } from "@/hooks/use-workspace-inspector";
import type { AppSettings } from "@/lib/app-settings";

export default function WorkspacePage({ settings, onOpenSettings }: { settings: AppSettings; onOpenSettings: () => void }) {
  const workspace = useWorkspace();
  const inspector = useWorkspaceInspector(workspace.activeProject.path);
  const conversationChanges = useConversationChanges(workspace.activeProject.path, workspace.activeConversationId, workspace.activeTurnIndexes);
  const [inspectorTab, setInspectorTab] = useState<"files" | "git">("files");
  const isBusy = Boolean(
    workspace.processes[workspace.activeConversationId]?.busy
    || workspace.activeTurnIndexes[workspace.activeConversationId] !== undefined,
  );

  const openChanges = () => setInspectorTab("git");
  const previewChange = (turnIndex: number, path: string) => {
    const change = conversationChanges.changesByTurn[turnIndex];
    if (!change) return;
    setInspectorTab("git");
    inspector.openDiff(path, change.baselineTree);
  };

  const sendMessage = () => workspace.sendMessage((turn) => conversationChanges.startTurn({
    ...turn,
    cwd: workspace.activeProject.path,
  }));

  return <TooltipProvider><div className="flex h-screen min-h-[640px] min-w-[960px] flex-col overflow-hidden bg-[var(--bg-window)] text-[var(--text-primary)]">
    <AppTopbar />
    <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
      <ResizablePanel id="workspace-sidebar" defaultSize={250} minSize={220} groupResizeBehavior="preserve-pixel-size" className="min-h-0 min-w-0 overflow-hidden">
        <WorkspaceSidebar
          projects={workspace.projects}
          conversations={workspace.conversations}
          pinnedConversationIds={workspace.pinnedConversationIds}
          activeProjectId={workspace.activeProject.id}
          activeConversationId={workspace.activeConversationId}
          processes={workspace.processes}
          completedConversationIds={workspace.completedConversationIds}
          isLoading={workspace.isLoading}
          onOpenSettings={onOpenSettings}
          onRefresh={workspace.refreshProjects}
          onNewProject={workspace.createProject}
          onRemoveProject={workspace.removeProject}
          onNewConversation={workspace.createConversation}
          onArchiveConversation={workspace.archiveConversation}
          onRenameConversation={workspace.renameConversation}
          onPinConversation={workspace.setConversationPinned}
          onSelectProject={workspace.selectProject}
          onSelectConversation={workspace.selectConversation}
        />
      </ResizablePanel>
      <ResizableHandle className="panel-resize-handle z-20" aria-label="调整项目栏宽度" />
      <ResizablePanel id="workspace-main" minSize={440} className="min-h-0 min-w-0 overflow-hidden">
        <main className="workspace-main flex h-full min-w-0 flex-col">
          <WorkspaceHeader project={workspace.activeProject} conversation={workspace.activeConversation} />
          <ChatPanel
            timeline={workspace.timeline}
            draft={workspace.draft}
            isBusy={isBusy}
            queuedTurns={workspace.queuedTurns}
            editingQueuedTurnId={workspace.editingQueuedTurnId}
            models={workspace.conversationState.availableModels}
            selectedModel={workspace.conversationState.model}
            thinkingLevel={workspace.conversationState.thinkingLevel}
            thinkingLevels={workspace.conversationState.availableThinkingLevels}
            contextUsage={workspace.conversationState.contextUsage}
            runtimeAvailable={workspace.runtimeIsTauri}
            onModelChange={workspace.setConversationModel}
            onThinkingChange={workspace.setConversationThinkingLevel}
            onReorderQueuedTurn={workspace.reorderQueuedTurn}
            onRemoveQueuedTurn={workspace.removeQueuedTurn}
            onSteerQueuedTurn={workspace.steerQueuedTurn}
            onEditQueuedTurn={workspace.editQueuedTurn}
            turnChanges={conversationChanges.changesByTurn}
            settings={settings}
            onDraftChange={workspace.setDraft}
            onSend={sendMessage}
            onAbort={workspace.abortConversation}
            onViewChanges={openChanges}
            onRefreshChanges={conversationChanges.refreshTurn}
            onPreviewChange={previewChange}
            activeExtensionRequest={workspace.activeExtensionRequest}
            extensionNotifications={workspace.extensionNotifications}
            extensionStatuses={workspace.extensionStatuses}
            extensionWidgets={workspace.extensionWidgets}
            onRespondToExtensionUi={workspace.respondToExtensionUi}
          />
        </main>
      </ResizablePanel>
      <ResizableHandle className="panel-resize-handle z-20" aria-label="调整检查器宽度" />
      <ResizablePanel id="workspace-inspector" defaultSize={340} minSize={280} groupResizeBehavior="preserve-pixel-size" className="min-h-0 min-w-0 overflow-hidden">
        <WorkspaceInspector
          tab={inspectorTab}
          files={inspector.files}
          gitStatus={inspector.gitStatus}
          preview={inspector.preview}
          selectedPath={inspector.selectedPath}
          isLoading={inspector.isLoading}
          error={inspector.error}
          gitOperation={inspector.gitOperation}
          gitNotice={inspector.gitNotice}
          onTabChange={setInspectorTab}
          onRefresh={inspector.refresh}
          onOpenFile={inspector.openFile}
          onOpenDiff={inspector.openDiff}
          onClosePreview={inspector.closePreview}
          onGitAction={inspector.runGitAction}
          onGitNoticeDismiss={inspector.dismissGitNotice}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  </div></TooltipProvider>;
}
