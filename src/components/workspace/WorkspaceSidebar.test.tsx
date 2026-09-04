// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSidebar } from "@/components/workspace/WorkspaceSidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
Reflect.set(globalThis, "ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  document.querySelectorAll('[data-slot="context-menu-content"]').forEach((item) => item.remove());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.restoreAllMocks();
});

describe("WorkspaceSidebar", () => {
  it("会话区快捷操作提示显示在按钮上方", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<TooltipProvider delayDuration={0}><WorkspaceSidebar
          projects={[]}
          conversations={[]}
          pinnedConversationIds={[]}
          collapsedProjectIds={[]}
          activeProjectId=""
          activeConversationId=""
          processes={{}}
          completedConversationIds={[]}
          isLoading={false}
          onOpenSettings={() => undefined}
          onRefresh={() => undefined}
          onNewProject={() => undefined}
          onRemoveProject={() => undefined}
          onNewConversation={() => undefined}
          onArchiveConversation={() => undefined}
          onRenameConversation={() => undefined}
          onPinConversation={() => undefined}
          onSetProjectCollapsed={() => undefined}
          onSelectProject={() => undefined}
          onSelectConversation={() => undefined}
        /></TooltipProvider>);
    });

    const newConversationButton = container.querySelector<HTMLButtonElement>('button[aria-label="新对话"]');
    await act(async () => {
      newConversationButton?.focus();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(document.querySelector('[data-slot="tooltip-content"]')?.getAttribute("data-side")).toBe("top");
  });

  it("提供新建项目入口和会话右键归档操作", async () => {
    const onNewProject = vi.fn();
    const onRemoveProject = vi.fn();
    const onArchiveConversation = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<TooltipProvider><WorkspaceSidebar
          projects={[{ id: "/code/demo", name: "demo", path: "/code/demo" }]}
          conversations={[{ id: "session-1", projectId: "/code/demo", title: "定位会话菜单", preview: "", time: "刚刚" }]}
          pinnedConversationIds={[]}
          collapsedProjectIds={[]}
          activeProjectId="/code/demo"
          activeConversationId="session-1"
          processes={{}}
          completedConversationIds={[]}
          isLoading={false}
          onOpenSettings={() => undefined}
          onRefresh={() => undefined}
          onNewProject={onNewProject}
          onRemoveProject={onRemoveProject}
          onNewConversation={() => undefined}
          onArchiveConversation={onArchiveConversation}
          onRenameConversation={() => undefined}
          onPinConversation={() => undefined}
          onSetProjectCollapsed={() => undefined}
          onSelectProject={() => undefined}
          onSelectConversation={() => undefined}
        /></TooltipProvider>);
    });

    const newProjectButton = container.querySelector<HTMLButtonElement>('button[aria-label="新建项目"]');
    expect(newProjectButton).not.toBeNull();
    act(() => newProjectButton?.click());
    expect(onNewProject).toHaveBeenCalledOnce();

    const removeProjectButton = container.querySelector<HTMLButtonElement>('button[aria-label="从 AI Desk 移除 demo"]');
    expect(removeProjectButton?.parentElement?.className).toContain("absolute");
    act(() => removeProjectButton?.click());
    expect(onRemoveProject).toHaveBeenCalledWith("/code/demo");

    const conversation = container.querySelector<HTMLElement>('[data-slot="context-menu-trigger"]');
    expect(conversation).not.toBeNull();
    await act(async () => {
      conversation?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, button: 2, clientX: 24, clientY: 32 }));
    });

    const archiveItem = Array.from(document.querySelectorAll<HTMLElement>('[data-slot="context-menu-item"]')).find((item) => item.textContent === "归档");
    expect(archiveItem).not.toBeUndefined();
    act(() => archiveItem?.click());
    expect(onArchiveConversation).toHaveBeenCalledOnce();
  });

  it("项目名称切换展开状态", async () => {
    const onSetProjectCollapsed = vi.fn();
    const onSelectProject = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const renderSidebar = (collapsedProjectIds: string[]) => {
      root?.render(<TooltipProvider><WorkspaceSidebar
        projects={[{ id: "/code/demo", name: "demo", path: "/code/demo" }]}
        conversations={[]}
        pinnedConversationIds={[]}
        collapsedProjectIds={collapsedProjectIds}
        activeProjectId="/code/demo"
        activeConversationId=""
        processes={{}}
        completedConversationIds={[]}
        isLoading={false}
        onOpenSettings={() => undefined}
        onRefresh={() => undefined}
        onNewProject={() => undefined}
        onRemoveProject={() => undefined}
        onNewConversation={() => undefined}
        onArchiveConversation={() => undefined}
        onRenameConversation={() => undefined}
        onPinConversation={() => undefined}
        onSetProjectCollapsed={onSetProjectCollapsed}
        onSelectProject={onSelectProject}
        onSelectConversation={() => undefined}
      /></TooltipProvider>);
    };

    await act(async () => renderSidebar([]));
    const projectName = container.querySelector<HTMLButtonElement>('button[aria-label="收起项目 demo"]');
    expect(projectName).not.toBeNull();
    act(() => projectName?.click());
    expect(onSetProjectCollapsed).toHaveBeenCalledWith("/code/demo", true);
    expect(onSelectProject).toHaveBeenCalledWith("/code/demo");

    onSetProjectCollapsed.mockClear();
    await act(async () => renderSidebar(["/code/demo"]));
    const collapsedProjectName = container.querySelector<HTMLButtonElement>('button[aria-label="展开项目 demo"]');
    expect(collapsedProjectName).not.toBeNull();
    act(() => collapsedProjectName?.click());
    expect(onSetProjectCollapsed).toHaveBeenCalledWith("/code/demo", false);
    expect(onSelectProject).toHaveBeenCalledWith("/code/demo");
  });

  it("运行中的会话不允许归档", async () => {
    const onArchiveConversation = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<TooltipProvider><WorkspaceSidebar
          projects={[{ id: "/code/demo", name: "demo", path: "/code/demo" }]}
          conversations={[{ id: "session-1", projectId: "/code/demo", title: "运行中的会话", preview: "", time: "刚刚" }]}
          pinnedConversationIds={[]}
          collapsedProjectIds={[]}
          activeProjectId="/code/demo"
          activeConversationId="session-1"
          processes={{ "session-1": { busy: true } }}
          completedConversationIds={[]}
          isLoading={false}
          onOpenSettings={() => undefined}
          onRefresh={() => undefined}
          onNewProject={() => undefined}
          onRemoveProject={() => undefined}
          onNewConversation={() => undefined}
          onArchiveConversation={onArchiveConversation}
          onRenameConversation={() => undefined}
          onPinConversation={() => undefined}
          onSetProjectCollapsed={() => undefined}
          onSelectProject={() => undefined}
          onSelectConversation={() => undefined}
        /></TooltipProvider>);
    });

    const conversation = container.querySelector<HTMLElement>('[data-slot="context-menu-trigger"]');
    await act(async () => {
      conversation?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, button: 2, clientX: 24, clientY: 32 }));
    });

    const archiveItem = Array.from(document.querySelectorAll<HTMLElement>('[data-slot="context-menu-item"]')).find((item) => item.textContent === "运行中，无法归档");
    const conversationStatus = container.querySelector<HTMLElement>('[data-slot="conversation-status"]');
    const actionArea = container.querySelector<HTMLButtonElement>('button[aria-label="置顶会话"]')?.parentElement;
    expect(archiveItem?.getAttribute("data-disabled")).toBe("");
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="demo 运行中，无法移除"]')?.disabled).toBe(true);
    expect(conversationStatus?.className).toContain("group-hover/conversation:opacity-0");
    expect(actionArea?.className).toContain("z-20");
    act(() => archiveItem?.click());
    expect(onArchiveConversation).not.toHaveBeenCalled();
  });

  it("每个项目默认展示 5 条对话并且每次展开 5 条", async () => {
    const conversations = Array.from({ length: 12 }, (_, index) => ({
      id: `session-${index + 1}`,
      projectId: "/code/demo",
      title: `对话 ${index + 1}`,
      preview: "",
      time: "刚刚",
    }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<TooltipProvider><WorkspaceSidebar
        projects={[{ id: "/code/demo", name: "demo", path: "/code/demo" }]}
        conversations={conversations}
        pinnedConversationIds={[]}
        collapsedProjectIds={[]}
        activeProjectId="/code/demo"
        activeConversationId=""
        processes={{}}
        completedConversationIds={[]}
        isLoading={false}
        onOpenSettings={() => undefined}
        onRefresh={() => undefined}
        onNewProject={() => undefined}
        onRemoveProject={() => undefined}
        onNewConversation={() => undefined}
        onArchiveConversation={() => undefined}
        onRenameConversation={() => undefined}
        onPinConversation={() => undefined}
        onSetProjectCollapsed={() => undefined}
        onSelectProject={() => undefined}
        onSelectConversation={() => undefined}
      /></TooltipProvider>);
    });

    const conversationList = container.querySelector<HTMLElement>('[data-slot="project-conversation-list"]');
    expect(conversationList?.className).not.toContain("max-h-[17.5rem]");
    expect(conversationList?.className).not.toContain("overflow-y-auto");
    expect(conversationList?.className).not.toContain("overscroll-contain");
    expect(container.querySelectorAll('[data-slot="conversation-title"]')).toHaveLength(5);

    const expandButton = () => container?.querySelector<HTMLButtonElement>('button[aria-label="展开 demo 的更多对话"]');
    act(() => expandButton()?.click());
    expect(container.querySelectorAll('[data-slot="conversation-title"]')).toHaveLength(10);

    act(() => expandButton()?.click());
    expect(container.querySelectorAll('[data-slot="conversation-title"]')).toHaveLength(12);
    expect(expandButton()).toBeNull();
  });

  it("不同项目的对话展开状态相互独立", async () => {
    const conversations = ["alpha", "beta"].flatMap((project) => Array.from({ length: 6 }, (_, index) => ({
      id: `${project}-${index + 1}`,
      projectId: `/code/${project}`,
      title: `${project} 对话 ${index + 1}`,
      preview: "",
      time: "刚刚",
    })));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<TooltipProvider><WorkspaceSidebar
        projects={[
          { id: "/code/alpha", name: "alpha", path: "/code/alpha" },
          { id: "/code/beta", name: "beta", path: "/code/beta" },
        ]}
        conversations={conversations}
        pinnedConversationIds={[]}
        collapsedProjectIds={[]}
        activeProjectId="/code/alpha"
        activeConversationId=""
        processes={{}}
        completedConversationIds={[]}
        isLoading={false}
        onOpenSettings={() => undefined}
        onRefresh={() => undefined}
        onNewProject={() => undefined}
        onRemoveProject={() => undefined}
        onNewConversation={() => undefined}
        onArchiveConversation={() => undefined}
        onRenameConversation={() => undefined}
        onPinConversation={() => undefined}
        onSetProjectCollapsed={() => undefined}
        onSelectProject={() => undefined}
        onSelectConversation={() => undefined}
      /></TooltipProvider>);
    });

    expect(container.querySelectorAll('[data-slot="conversation-title"]')).toHaveLength(10);
    act(() => container?.querySelector<HTMLButtonElement>('button[aria-label="展开 alpha 的更多对话"]')?.click());
    expect(container.querySelectorAll('[data-slot="conversation-title"]')).toHaveLength(11);
    expect(container.textContent).toContain("alpha 对话 6");
    expect(container.textContent).not.toContain("beta 对话 6");
  });

  it("会话悬停操作区提供置顶和归档按钮", async () => {
    const onPinConversation = vi.fn();
    const onArchiveConversation = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<TooltipProvider><WorkspaceSidebar
          projects={[{ id: "/code/demo", name: "demo", path: "/code/demo" }]}
          conversations={[{ id: "session-1", projectId: "/code/demo", title: "快捷操作", preview: "", time: "刚刚" }]}
          pinnedConversationIds={[]}
          collapsedProjectIds={[]}
          activeProjectId="/code/demo"
          activeConversationId="session-1"
          processes={{}}
          completedConversationIds={[]}
          isLoading={false}
          onOpenSettings={() => undefined}
          onRefresh={() => undefined}
          onNewProject={() => undefined}
          onRemoveProject={() => undefined}
          onNewConversation={() => undefined}
          onArchiveConversation={onArchiveConversation}
          onRenameConversation={() => undefined}
          onPinConversation={onPinConversation}
          onSetProjectCollapsed={() => undefined}
          onSelectProject={() => undefined}
          onSelectConversation={() => undefined}
        /></TooltipProvider>);
    });

    const pinButton = container.querySelector<HTMLButtonElement>('button[aria-label="置顶会话"]');
    const archiveButton = container.querySelector<HTMLButtonElement>('button[aria-label="归档会话"]');
    const actionArea = pinButton?.parentElement;
    const conversationTitle = container.querySelector('[data-slot="conversation-title"]');

    expect(conversationTitle?.className).toContain("flex-1");
    expect(conversationTitle?.parentElement?.className).toContain("group-hover/conversation:pr-12");
    expect(conversationTitle?.parentElement?.className).toContain("group-focus-within/conversation:pr-12");
    expect(container.querySelector('[data-slot="conversation-status"]')).toBeNull();
    expect(actionArea?.className).toContain("invisible");
    expect(actionArea?.className).toContain("absolute");
    expect(actionArea?.className).toContain("group-hover/conversation:visible");
    act(() => pinButton?.click());
    act(() => archiveButton?.click());
    expect(onPinConversation).toHaveBeenCalledWith("session-1", true);
    expect(onArchiveConversation).toHaveBeenCalledWith("session-1");
  });

  it("执行完成后显示主题圆点，点击查看后移除", async () => {
    const onSelectConversation = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const renderSidebar = (completedConversationIds: string[]) => root?.render(<TooltipProvider><WorkspaceSidebar
      projects={[{ id: "/code/demo", name: "demo", path: "/code/demo" }]}
      conversations={[{ id: "session-1", projectId: "/code/demo", title: "等待查看", preview: "", time: "刚刚" }]}
      pinnedConversationIds={[]}
      collapsedProjectIds={[]}
      activeProjectId="/code/demo"
      activeConversationId=""
      processes={{ "session-1": { busy: false } }}
      completedConversationIds={completedConversationIds}
      isLoading={false}
      onOpenSettings={() => undefined}
      onRefresh={() => undefined}
      onNewProject={() => undefined}
      onRemoveProject={() => undefined}
      onNewConversation={() => undefined}
      onArchiveConversation={() => undefined}
      onRenameConversation={() => undefined}
      onPinConversation={() => undefined}
      onSetProjectCollapsed={() => undefined}
      onSelectProject={() => undefined}
      onSelectConversation={onSelectConversation}
    /></TooltipProvider>);

    await act(async () => renderSidebar(["session-1"]));
    expect(container.querySelector('[aria-label="执行完成，点击查看"]')).not.toBeNull();

    const completedConversationButton = container.querySelector<HTMLButtonElement>('button[title="等待查看"]');
    act(() => completedConversationButton?.click());
    expect(onSelectConversation).toHaveBeenCalledOnce();

    await act(async () => renderSidebar([]));
    expect(container.querySelector('[aria-label="执行完成，点击查看"]')).toBeNull();
  });

  it("支持置顶、取消置顶和重命名会话", async () => {
    const onPinConversation = vi.fn();
    const onRenameConversation = vi.fn();
    vi.spyOn(window, "prompt").mockReturnValue("新的会话名称");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<TooltipProvider><WorkspaceSidebar
          projects={[{ id: "/code/demo", name: "demo", path: "/code/demo" }]}
          conversations={[{ id: "session-1", projectId: "/code/demo", title: "原会话名称", preview: "", time: "刚刚" }]}
          pinnedConversationIds={[]}
          collapsedProjectIds={[]}
          activeProjectId="/code/demo"
          activeConversationId="session-1"
          processes={{}}
          completedConversationIds={[]}
          isLoading={false}
          onOpenSettings={() => undefined}
          onRefresh={() => undefined}
          onNewProject={() => undefined}
          onRemoveProject={() => undefined}
          onNewConversation={() => undefined}
          onArchiveConversation={() => undefined}
          onRenameConversation={onRenameConversation}
          onPinConversation={onPinConversation}
          onSetProjectCollapsed={() => undefined}
          onSelectProject={() => undefined}
          onSelectConversation={() => undefined}
        /></TooltipProvider>);
    });

    const conversation = container.querySelector<HTMLElement>('[data-slot="context-menu-trigger"]');
    await openContextMenu(conversation);
    act(() => findMenuItem("置顶")?.click());
    expect(onPinConversation).toHaveBeenCalledWith("session-1", true);

    await openContextMenu(conversation);
    act(() => findMenuItem("重命名")?.click());
    expect(window.prompt).toHaveBeenCalledWith("重命名会话", "原会话名称");
    expect(onRenameConversation).toHaveBeenCalledWith("session-1", "新的会话名称");

    await act(async () => {
      root?.render(<TooltipProvider><WorkspaceSidebar
          projects={[{ id: "/code/demo", name: "demo", path: "/code/demo" }]}
          conversations={[{ id: "session-1", projectId: "/code/demo", title: "原会话名称", preview: "", time: "刚刚" }]}
          pinnedConversationIds={["session-1"]}
          collapsedProjectIds={[]}
          activeProjectId="/code/demo"
          activeConversationId="session-1"
          processes={{}}
          completedConversationIds={[]}
          isLoading={false}
          onOpenSettings={() => undefined}
          onRefresh={() => undefined}
          onNewProject={() => undefined}
          onRemoveProject={() => undefined}
          onNewConversation={() => undefined}
          onArchiveConversation={() => undefined}
          onRenameConversation={onRenameConversation}
          onPinConversation={onPinConversation}
          onSetProjectCollapsed={() => undefined}
          onSelectProject={() => undefined}
          onSelectConversation={() => undefined}
        /></TooltipProvider>);
    });

    const pinnedConversation = container.querySelector<HTMLElement>('[data-slot="context-menu-trigger"]');
    await openContextMenu(pinnedConversation);
    act(() => findMenuItem("取消置顶")?.click());
    expect(onPinConversation).toHaveBeenLastCalledWith("session-1", false);
  });
});

function findMenuItem(label: string) {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-slot="context-menu-item"]')).find((item) => item.textContent === label);
}

function openContextMenu(conversation?: HTMLElement | null) {
  return act(async () => {
    conversation?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, button: 2, clientX: 24, clientY: 32 }));
  });
}
