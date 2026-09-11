import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "@/components/chat/ChatPanel";

const workspace = vi.hoisted(() => ({
  activeProject: { id: "/demo", name: "demo", path: "/demo" },
  activeConversation: null,
  activeConversationId: "",
  activeTurnIndexes: {},
  processes: {},
  projects: [],
  conversations: [],
  pinnedConversationIds: [],
  completedConversationIds: [],
  isLoading: false,
  timeline: [],
  draft: "",
  attachmentDraft: { attachments: [], pending: 0, error: null, addFiles: vi.fn(), remove: vi.fn() },
  queuedTurns: [],
  conversationState: { availableModels: [], model: "", thinkingLevel: "", availableThinkingLevels: [], goal: null as null | { objective: string; status: string }, slashCommands: [] as { name: string; description: string; source: string }[] },
  runtimeIsTauri: false,
  activeExtensionRequest: null,
  extensionNotifications: [],
  extensionStatuses: [],
  extensionWidgets: [],
  refreshProjects: vi.fn(),
  createProject: vi.fn(),
  createConversation: vi.fn(),
  archiveConversation: vi.fn(),
  renameConversation: vi.fn(),
  setConversationPinned: vi.fn(),
  selectProject: vi.fn(),
  selectConversation: vi.fn(),
  setConversationModel: vi.fn(),
  setConversationThinkingLevel: vi.fn(),
  reorderQueuedTurn: vi.fn(),
  removeQueuedTurn: vi.fn(),
  steerQueuedTurn: vi.fn(),
  setDraft: vi.fn(),
  sendMessage: vi.fn(),
  abortConversation: vi.fn(),
  respondToExtensionUi: vi.fn(),
  refreshSlashCommands: vi.fn(),
}));

vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children, orientation }: { children: ReactNode; orientation: string }) => createElement("div", { "data-layout": orientation }, children),
  ResizablePanel: ({ children, id, defaultSize, minSize, maxSize, groupResizeBehavior }: { children: ReactNode; id: string; defaultSize?: number; minSize: number; maxSize?: number; groupResizeBehavior?: string }) => createElement("section", {
    "data-panel-id": id,
    "data-default-size": defaultSize,
    "data-min-size": minSize,
    "data-max-size": maxSize,
    "data-resize-behavior": groupResizeBehavior,
  }, children),
  ResizableHandle: ({ "aria-label": ariaLabel }: { "aria-label": string }) => createElement("div", { role: "separator", "aria-label": ariaLabel }),
}));
vi.mock("@/components/workspace/AppTopbar", () => ({ AppTopbar: () => null }));
vi.mock("@/components/workspace/WorkspaceSidebar", () => ({ WorkspaceSidebar: () => null }));
vi.mock("@/components/workspace/WorkspaceHeader", () => ({ WorkspaceHeader: () => null }));
vi.mock("@/components/workspace/WorkspaceInspector", () => ({ WorkspaceInspector: () => null }));
vi.mock("@/components/chat/ChatPanel", () => ({ ChatPanel: vi.fn(() => null) }));
vi.mock("@/hooks/use-workspace", () => ({ useWorkspace: () => workspace }));
vi.mock("@/hooks/use-conversation-changes", () => ({
  useConversationChanges: () => ({ changesByTurn: {}, startTurn: vi.fn(), refreshTurn: vi.fn() }),
}));
vi.mock("@/hooks/use-workspace-inspector", () => ({
  useWorkspaceInspector: () => ({
    files: [],
    gitStatus: null,
    preview: null,
    selectedPath: null,
    isLoading: false,
    error: null,
    gitOperation: null,
    gitNotice: null,
    refresh: vi.fn(),
    openFile: vi.fn(),
    openDiff: vi.fn(),
    closePreview: vi.fn(),
    runGitAction: vi.fn(),
    dismissGitNotice: vi.fn(),
  }),
}));

import WorkspacePage from "@/pages/WorkspacePage";

afterEach(() => {
  workspace.activeProject = { id: "/demo", name: "demo", path: "/demo" };
  workspace.draft = "";
  workspace.conversationState.goal = null;
  workspace.conversationState.slashCommands = [];
  vi.clearAllMocks();
});

describe("WorkspacePage panel layout", () => {
  it.each(["", "/demo"])("按项目而非会话决定是否可发送：%j", (projectId) => {
    workspace.activeProject = { id: projectId, name: "demo", path: projectId };
    workspace.draft = "首次任务";
    renderToStaticMarkup(<WorkspacePage onOpenSettings={vi.fn()} />);

    expect(workspace.activeConversationId).toBe("");
    expect(vi.mocked(ChatPanel).mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      canSend: Boolean(projectId),
      conversationId: "",
      draft: "首次任务",
    }));
  });

  it("把目标状态传给 ChatPanel 展示在输入框上方队列区域", () => {
    workspace.conversationState.goal = { objective: "修复滚动", status: "active" };
    renderToStaticMarkup(<WorkspacePage onOpenSettings={vi.fn()} />);

    expect(vi.mocked(ChatPanel).mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      goal: { objective: "修复滚动", status: "active" },
    }));
  });

  it("把 pi 动态斜杠命令传给 ChatPanel 作为输入提示", () => {
    workspace.conversationState.slashCommands = [{ name: "goal", description: "长跑目标", source: "extension" }];
    renderToStaticMarkup(<WorkspacePage onOpenSettings={vi.fn()} />);

    expect(vi.mocked(ChatPanel).mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      slashCommands: [{ name: "goal", description: "长跑目标", source: "extension" }],
      onSlashMenuOpen: workspace.refreshSlashCommands,
    }));
  });

  it("只使用三块区域的最小宽度约束拖动范围", () => {
    const html = renderToStaticMarkup(<WorkspacePage onOpenSettings={vi.fn()} />);

    expect(html).toContain('data-layout="horizontal"');
    expect(html).toMatch(/data-panel-id="workspace-sidebar"[^>]*data-default-size="250"[^>]*data-min-size="220"/);
    expect(html).toMatch(/data-panel-id="workspace-main"[^>]*data-min-size="440"/);
    expect(html).toMatch(/data-panel-id="workspace-inspector"[^>]*data-default-size="340"[^>]*data-min-size="280"/);
    expect(html).not.toContain("data-max-size");
    expect(html).toContain('aria-label="调整项目栏宽度"');
    expect(html).toContain('aria-label="调整检查器宽度"');
    expect((html.match(/data-resize-behavior="preserve-pixel-size"/g) ?? []).length).toBe(2);
    expect(html).not.toMatch(/<main[^>]*bg-\[var\(--bg-workspace\)\]/);
  });
});
