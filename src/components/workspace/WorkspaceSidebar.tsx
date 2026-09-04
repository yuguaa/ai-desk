import { memo, useState } from "react";
import { Archive, ChevronDown, FolderClosed, FolderOpen, FolderPlus, MessageSquare, MessageSquarePlus, Pencil, Pin, Plus, RefreshCw, Settings, X } from "@/components/ui/icons";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Spinner } from "@/components/ui/spinner";
import { SidebarIconButton } from "@/components/workspace/SidebarIconButton";
import { cn } from "@/lib/utils";
import type { ConversationRecord, Project } from "@/types/workspace";

const CONVERSATION_PAGE_SIZE = 5;

export const WorkspaceSidebar = memo(function WorkspaceSidebar({ projects, conversations, pinnedConversationIds, collapsedProjectIds, activeProjectId, activeConversationId, processes, completedConversationIds, isLoading, onOpenSettings, onRefresh, onNewProject, onRemoveProject, onNewConversation, onArchiveConversation, onRenameConversation, onPinConversation, onSetProjectCollapsed, onSelectProject, onSelectConversation }: {
  projects: Project[];
  conversations: ConversationRecord[];
  pinnedConversationIds: string[];
  collapsedProjectIds: string[];
  activeProjectId: string;
  activeConversationId: string;
  processes: Record<string, { busy: boolean }>;
  completedConversationIds: string[];
  isLoading: boolean;
  onOpenSettings: () => void;
  onRefresh: () => void;
  onNewProject: () => void;
  onRemoveProject: (projectId: string) => void;
  onNewConversation: (projectId?: string) => void;
  onArchiveConversation: (conversationId: string) => void;
  onRenameConversation: (conversationId: string, name: string) => void;
  onPinConversation: (conversationId: string, pinned: boolean) => void;
  onSetProjectCollapsed: (projectId: string, collapsed: boolean) => void;
  onSelectProject: (projectId: string) => void;
  onSelectConversation: (conversation: ConversationRecord) => void;
}) {
  const [visibleConversationCounts, setVisibleConversationCounts] = useState<Record<string, number>>({});

  return (
    <aside className="flex h-full w-full min-w-0 flex-col bg-[var(--bg-sidebar)]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-[var(--container-padding-tight)]">
        <p className="text-[var(--font-size-11)] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)]">工作区</p>
        <div className="flex items-center gap-0.5">
          <SidebarIconButton label="新对话" onClick={() => onNewConversation()}><MessageSquarePlus size={14} /></SidebarIconButton>
          <SidebarIconButton label="新建项目" onClick={onNewProject}><FolderPlus size={14} /></SidebarIconButton>
          <SidebarIconButton label="刷新项目" onClick={onRefresh}><RefreshCw size={14} className={cn(isLoading && "animate-spin")} /></SidebarIconButton>
        </div>
      </div>
      <ScrollArea className="panel-scroll-area min-h-0 flex-1">
        <div className="flex min-w-0 flex-col gap-0.5 p-[var(--container-padding-tight)]">
          {projects.length ? projects.map((project) => {
            const projectConversations = conversations.filter((conversation) => conversation.projectId === project.id);
            const isActive = activeProjectId === project.id;
            const isCollapsed = collapsedProjectIds.includes(project.id);
            const isBusy = projectConversations.some((conversation) => processes[conversation.id]?.busy);
            const visibleConversationCount = visibleConversationCounts[project.id] ?? CONVERSATION_PAGE_SIZE;
            const visibleProjectConversations = projectConversations.slice(0, visibleConversationCount);
            const hasMoreConversations = visibleProjectConversations.length < projectConversations.length;
            return (
              <div key={project.id} className="min-w-0">
                <div className={cn("group/project relative flex h-8 min-w-0 items-center gap-0.5 overflow-hidden rounded-[var(--radius-sm)] text-[var(--font-size-12-5)] transition-[background-color,color] duration-[var(--motion-fast)] hover:bg-[var(--bg-hover)] focus-within:bg-[var(--bg-hover)]", isActive ? "text-[var(--accent)]" : "text-[var(--text-secondary)]")}>
                  <Button type="button" variant="ghost" className="h-8 min-w-0 flex-1 shrink justify-start gap-1.5 overflow-hidden rounded-none px-2 py-1 text-left text-[var(--font-size-12-5)] font-normal text-inherit hover:bg-transparent hover:text-inherit active:scale-100" onClick={() => { onSetProjectCollapsed(project.id, !isCollapsed); onSelectProject(project.id); }} title={project.path} aria-label={isCollapsed ? `展开项目 ${project.name}` : `收起项目 ${project.name}`}>
                    <span className="grid size-5 shrink-0 place-items-center text-[var(--text-tertiary)]">{isCollapsed ? <FolderClosed size={14} /> : <FolderOpen size={14} />}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{project.name}</span>
                  </Button>
                  <div className="invisible pointer-events-none absolute inset-y-0 right-0 z-10 flex items-center bg-[var(--bg-hover)] pr-1 opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover/project:visible group-hover/project:pointer-events-auto group-hover/project:opacity-100 group-focus-within/project:visible group-focus-within/project:pointer-events-auto group-focus-within/project:opacity-100">
                    <SidebarIconButton label={`在 ${project.name} 中新建对话`} className="size-5" onClick={() => onNewConversation(project.id)}><Plus size={13} /></SidebarIconButton>
                    <SidebarIconButton label={isBusy ? `${project.name} 运行中，无法移除` : `从 AI Desk 移除 ${project.name}`} className="size-5" disabled={isBusy} onClick={() => onRemoveProject(project.id)}><X size={12} /></SidebarIconButton>
                  </div>
                </div>
                {!isCollapsed && (
                  <div className="ml-5 mt-0.5 min-w-0 border-l border-[var(--border-subtle)] pl-1">
                    {projectConversations.length ? (
                      <>
                        <div data-slot="project-conversation-list">
                          {visibleProjectConversations.map((conversation) => <ConversationNav key={conversation.id} conversation={conversation} selected={activeConversationId === conversation.id} pinned={pinnedConversationIds.includes(conversation.id)} busy={Boolean(processes[conversation.id]?.busy)} completed={completedConversationIds.includes(conversation.id)} onClick={() => onSelectConversation(conversation)} onArchive={() => onArchiveConversation(conversation.id)} onPin={(pinned) => onPinConversation(conversation.id, pinned)} onRename={() => { const name = window.prompt("重命名会话", conversation.title)?.trim(); if (name) onRenameConversation(conversation.id, name); }} />)}
                        </div>
                        {hasMoreConversations && <Button type="button" variant="ghost" className="mt-0.5 h-6 w-full justify-center gap-1 px-2 text-[var(--font-size-10-5)] font-normal text-[var(--text-tertiary)]" aria-label={`展开 ${project.name} 的更多对话`} onClick={() => setVisibleConversationCounts((counts) => ({ ...counts, [project.id]: Math.min(visibleConversationCount + CONVERSATION_PAGE_SIZE, projectConversations.length) }))}><ChevronDown size={12} />展开更多</Button>}
                      </>
                    ) : (
                      <p className="px-2 py-1.5 text-[var(--font-size-10-5)] text-[var(--text-tertiary)]">还没有对话</p>
                    )}
                  </div>
                )}
              </div>
            );
          }) : <div className="mx-2 mt-8 flex flex-col items-center gap-3 text-center"><span className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-[var(--control-bg)] text-[var(--text-tertiary)]"><FolderPlus size={17} /></span><div><p className="text-[var(--font-size-12)] font-medium text-[var(--text-secondary)]">还没有项目</p><p className="mt-0.5 text-[var(--font-size-10-5)] text-[var(--text-tertiary)]">选择一个目录开始工作</p></div><Button type="button" variant="outline" size="sm" onClick={onNewProject}><FolderPlus size={13} />新建项目</Button></div>}
        </div>
      </ScrollArea>
      <div className="shrink-0 border-t border-[var(--border-subtle)] p-[var(--container-padding-tight)]">
        <Button type="button" variant="ghost" className="h-7 w-full justify-start gap-2 px-2 text-[var(--font-size-12)] font-normal" onClick={onOpenSettings}><Settings size={14} />设置</Button>
      </div>
    </aside>
  );
});

function ConversationNav({ conversation, selected, pinned, busy, completed, onClick, onArchive, onPin, onRename }: { conversation: ConversationRecord; selected: boolean; pinned: boolean; busy: boolean; completed: boolean; onClick: () => void; onArchive: () => void; onPin: (pinned: boolean) => void; onRename: () => void }) {
  return <ContextMenu>
    <ContextMenuTrigger asChild>
      <div className={cn("group/conversation relative flex h-7 w-full min-w-0 items-center overflow-hidden rounded-[var(--radius-sm)] transition-[background-color,color] duration-[var(--motion-fast)]", selected ? "bg-[var(--accent-tint)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] focus-within:bg-[var(--bg-hover)]")}>
        <Button type="button" variant="ghost" className="h-7 w-full min-w-0 justify-start gap-1.5 overflow-hidden rounded-none px-2 text-left text-[var(--font-size-12)] font-normal text-inherit transition-[padding] hover:bg-transparent hover:text-inherit active:scale-100 group-hover/conversation:pr-12 group-focus-within/conversation:pr-12" onClick={onClick} title={conversation.title}><MessageSquare size={13} className={selected ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]"} />{pinned && <Pin size={12} title="已置顶" className="text-[var(--text-tertiary)]" />}<span data-slot="conversation-title" className="min-w-0 flex-1 truncate">{conversation.title}</span>{(busy || completed) && <span data-slot="conversation-status" className="grid size-3 shrink-0 place-items-center transition-opacity duration-[var(--motion-fast)] group-hover/conversation:opacity-0 group-focus-within/conversation:opacity-0">{busy ? <Spinner className="size-3 text-[var(--accent)]" /> : <span className="size-1.5 rounded-full bg-[var(--accent)]" role="status" aria-label="执行完成，点击查看" />}</span>}</Button>
        <div className={cn("invisible pointer-events-none absolute inset-y-0 right-0 z-20 flex items-center pr-0.5 opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover/conversation:visible group-hover/conversation:pointer-events-auto group-hover/conversation:opacity-100 group-focus-within/conversation:visible group-focus-within/conversation:pointer-events-auto group-focus-within/conversation:opacity-100", selected ? "bg-[var(--accent-tint)]" : "bg-[var(--bg-hover)]")}>
          <SidebarIconButton label={pinned ? "取消置顶会话" : "置顶会话"} className={cn("size-5", pinned && "text-[var(--accent)]")} onClick={() => onPin(!pinned)}><Pin size={12} /></SidebarIconButton>
          <SidebarIconButton label={busy ? "运行中，无法归档" : "归档会话"} className="size-5" disabled={busy} onClick={onArchive}><Archive size={12} /></SidebarIconButton>
        </div>
      </div>
    </ContextMenuTrigger>
    <ContextMenuContent className="w-40">
      <ContextMenuItem onSelect={() => onPin(!pinned)}><Pin size={13} />{pinned ? "取消置顶" : "置顶"}</ContextMenuItem>
      <ContextMenuItem onSelect={onClick}><MessageSquare size={13} />打开</ContextMenuItem>
      <ContextMenuItem onSelect={onRename}><Pencil size={13} />重命名</ContextMenuItem>
      <ContextMenuItem disabled={busy} onSelect={onArchive}><Archive size={13} />{busy ? "运行中，无法归档" : "归档"}</ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>;
}
