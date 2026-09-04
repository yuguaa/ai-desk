import { useCallback, useRef, useState } from "react";
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

export default function WorkspacePage({ onOpenSettings }: { onOpenSettings: () => void }) {
  const workspace = useWorkspace();
  const inspector = useWorkspaceInspector(workspace.activeProject.path);
  const conversationChanges = useConversationChanges(workspace.activeProject.path, workspace.activeConversationId, workspace.activeTurnIndexes);
  const [inspectorTab, setInspectorTab] = useState<"files" | "git">("files");
  const workspaceRef = useRef(workspace);
  const inspectorRef = useRef(inspector);
  const conversationChangesRef = useRef(conversationChanges);
  workspaceRef.current = workspace;
  inspectorRef.current = inspector;
  conversationChangesRef.current = conversationChanges;
  const isBusy = Boolean(
    workspace.processes[workspace.activeConversationId]?.busy
    || workspace.activeTurnIndexes[workspace.activeConversationId] !== undefined,
  );

  const openChanges = useCallback(() => setInspectorTab("git"), []);
  const previewChange = useCallback((turnIndex: number, path: string) => {
    const change = conversationChangesRef.current.changesByTurn[turnIndex];
    if (!change) return;
    setInspectorTab("git");
    inspectorRef.current.openDiff(path, change.baselineTree, change.endTree ?? undefined);
  }, []);

  const sendMessage = useCallback(() => workspaceRef.current.sendMessage((turn) => conversationChangesRef.current.startTurn({
    ...turn,
    cwd: workspaceRef.current.activeProject.path,
  })), []);

  const onRefreshProjects = useCallback(() => workspaceRef.current.refreshProjects(), []);
  const onNewProject = useCallback(() => workspaceRef.current.createProject(), []);
  const onRemoveProject = useCallback((projectId: string) => workspaceRef.current.removeProject(projectId), []);
  const onNewConversation = useCallback((projectId?: string) => workspaceRef.current.createConversation(projectId), []);
  const onArchiveConversation = useCallback((conversationId: string) => workspaceRef.current.archiveConversation(conversationId), []);
  const onRenameConversation = useCallback((conversationId: string, name: string) => workspaceRef.current.renameConversation(conversationId, name), []);
  const onPinConversation = useCallback((conversationId: string, pinned: boolean) => workspaceRef.current.setConversationPinned(conversationId, pinned), []);
  const onSetProjectCollapsed = useCallback((projectId: string, collapsed: boolean) => workspaceRef.current.setProjectCollapsed(projectId, collapsed), []);
  const onSelectProject = useCallback((projectId: string) => workspaceRef.current.selectProject(projectId), []);
  const onSelectConversation = useCallback((conversation: Parameters<typeof workspace.selectConversation>[0]) => workspaceRef.current.selectConversation(conversation), []);
  const onRefreshInspector = useCallback(() => inspectorRef.current.refresh(), []);
  const onOpenFile = useCallback((path: string) => inspectorRef.current.openFile(path), []);
  const onOpenDiff = useCallback((path: string, baselineTree?: string, endTree?: string) => inspectorRef.current.openDiff(path, baselineTree, endTree), []);
  const onClosePreview = useCallback(() => inspectorRef.current.closePreview(), []);
  const onGitAction = useCallback((action: Parameters<typeof inspector.runGitAction>[0]) => inspectorRef.current.runGitAction(action), []);
  const onGitNoticeDismiss = useCallback(() => inspectorRef.current.dismissGitNotice(), []);

  return <TooltipProvider><div className="flex h-screen min-h-[640px] min-w-[960px] flex-col overflow-hidden bg-[var(--bg-window)] text-[var(--text-primary)]">
    <AppTopbar />
    <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
      <ResizablePanel id="workspace-sidebar" defaultSize={250} minSize={220} groupResizeBehavior="preserve-pixel-size" className="min-h-0 min-w-0 overflow-hidden">
        <WorkspaceSidebar
          projects={workspace.projects}
          conversations={workspace.conversations}
          pinnedConversationIds={workspace.pinnedConversationIds}
          collapsedProjectIds={workspace.collapsedProjectIds}
          activeProjectId={workspace.activeProject.id}
          activeConversationId={workspace.activeConversationId}
          processes={workspace.processes}
          completedConversationIds={workspace.completedConversationIds}
          isLoading={workspace.isLoading}
          onOpenSettings={onOpenSettings}
          onRefresh={onRefreshProjects}
          onNewProject={onNewProject}
          onRemoveProject={onRemoveProject}
          onNewConversation={onNewConversation}
          onArchiveConversation={onArchiveConversation}
          onRenameConversation={onRenameConversation}
          onPinConversation={onPinConversation}
          onSetProjectCollapsed={onSetProjectCollapsed}
          onSelectProject={onSelectProject}
          onSelectConversation={onSelectConversation}
        />
      </ResizablePanel>
      <ResizableHandle className="panel-resize-handle z-20" aria-label="调整项目栏宽度" />
      <ResizablePanel id="workspace-main" minSize={440} className="min-h-0 min-w-0 overflow-hidden">
        <main className="workspace-main flex h-full min-w-0 flex-col">
          <WorkspaceHeader project={workspace.activeProject} conversation={workspace.activeConversation} />
          <ChatPanel
            conversationId={workspace.activeConversationId}
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
            onDraftChange={workspace.setDraft}
            onSend={sendMessage}
            onAbort={workspace.abortConversation}
            onViewChanges={openChanges}
            onRefreshChanges={conversationChanges.refreshTurn}
            onPreviewChange={previewChange}
            onRevertChange={conversationChanges.revertTurn}
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
          onRefresh={onRefreshInspector}
          onOpenFile={onOpenFile}
          onOpenDiff={onOpenDiff}
          onClosePreview={onClosePreview}
          onGitAction={onGitAction}
          onGitNoticeDismiss={onGitNoticeDismiss}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  </div></TooltipProvider>;
}
