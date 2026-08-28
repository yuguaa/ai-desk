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
          projects={[{ id: "/code/demo", name: "demo", path: "/code/demo", tone: "" }]}
          conversations={[{ id: "session-1", projectId: "/code/demo", title: "定位会话菜单", preview: "", time: "刚刚" }]}
          pinnedConversationIds={[]}
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

  it("运行中的会话不允许归档", async () => {
    const onArchiveConversation = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<TooltipProvider><WorkspaceSidebar
          projects={[{ id: "/code/demo", name: "demo", path: "/code/demo", tone: "" }]}
          conversations={[{ id: "session-1", projectId: "/code/demo", title: "运行中的会话", preview: "", time: "刚刚" }]}
          pinnedConversationIds={[]}
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
          onSelectProject={() => undefined}
          onSelectConversation={() => undefined}
        /></TooltipProvider>);
    });

    const conversation = container.querySelector<HTMLElement>('[data-slot="context-menu-trigger"]');
    await act(async () => {
      conversation?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, button: 2, clientX: 24, clientY: 32 }));
    });

    const archiveItem = Array.from(document.querySelectorAll<HTMLElement>('[data-slot="context-menu-item"]')).find((item) => item.textContent === "运行中，无法归档");
    expect(archiveItem?.getAttribute("data-disabled")).toBe("");
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="demo 运行中，无法移除"]')?.disabled).toBe(true);
    act(() => archiveItem?.click());
    expect(onArchiveConversation).not.toHaveBeenCalled();
  });

  it("会话悬停操作区提供置顶和归档按钮", async () => {
    const onPinConversation = vi.fn();
    const onArchiveConversation = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<TooltipProvider><WorkspaceSidebar
          projects={[{ id: "/code/demo", name: "demo", path: "/code/demo", tone: "" }]}
          conversations={[{ id: "session-1", projectId: "/code/demo", title: "快捷操作", preview: "", time: "刚刚" }]}
          pinnedConversationIds={[]}
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
          onSelectProject={() => undefined}
          onSelectConversation={() => undefined}
        /></TooltipProvider>);
    });

    const pinButton = container.querySelector<HTMLButtonElement>('button[aria-label="置顶会话"]');
    const archiveButton = container.querySelector<HTMLButtonElement>('button[aria-label="归档会话"]');
    const actionArea = pinButton?.parentElement;
    const conversationTitle = container.querySelector('[data-slot="conversation-title"]');

    expect(conversationTitle?.className).toContain("flex-1");
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
      projects={[{ id: "/code/demo", name: "demo", path: "/code/demo", tone: "" }]}
      conversations={[{ id: "session-1", projectId: "/code/demo", title: "等待查看", preview: "", time: "刚刚" }]}
      pinnedConversationIds={[]}
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
          projects={[{ id: "/code/demo", name: "demo", path: "/code/demo", tone: "" }]}
          conversations={[{ id: "session-1", projectId: "/code/demo", title: "原会话名称", preview: "", time: "刚刚" }]}
          pinnedConversationIds={[]}
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
          projects={[{ id: "/code/demo", name: "demo", path: "/code/demo", tone: "" }]}
          conversations={[{ id: "session-1", projectId: "/code/demo", title: "原会话名称", preview: "", time: "刚刚" }]}
          pinnedConversationIds={["session-1"]}
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
