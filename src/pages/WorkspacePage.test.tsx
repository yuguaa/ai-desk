import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_APP_SETTINGS } from "@/lib/app-settings";

const workspace = vi.hoisted(() => ({
  activeProject: { id: "/demo", name: "demo", path: "/demo", tone: "" },
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
  queuedTurns: [],
  conversationState: { availableModels: [], model: "", thinkingLevel: "", availableThinkingLevels: [] },
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
vi.mock("@/components/chat/ChatPanel", () => ({ ChatPanel: () => null }));
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

describe("WorkspacePage panel layout", () => {
  it("只使用三块区域的最小宽度约束拖动范围", () => {
    const html = renderToStaticMarkup(<WorkspacePage settings={DEFAULT_APP_SETTINGS} onOpenSettings={vi.fn()} />);

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
