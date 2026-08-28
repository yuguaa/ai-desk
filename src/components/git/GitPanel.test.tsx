// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitPanel } from "@/components/git/GitPanel";
import { GitNoticeToast } from "@/components/git/GitNoticeToast";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { GitAction, GitStatus } from "@/types/workspace";

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
  container?.remove();
  document.querySelectorAll('[data-slot="tooltip-content"]').forEach((item) => item.remove());
  root = undefined;
  container = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("GitPanel", () => {
  it("支持暂存全部和单文件暂存", async () => {
    const onGitAction = vi.fn(() => Promise.resolve(true));
    await renderPanel({
      branch: "main",
      clean: false,
      additions: 2,
      deletions: 1,
      files: [{ code: " M", path: "src/App.tsx" }],
    }, onGitAction);

    act(() => findButton("暂存全部")?.click());
    act(() => findButton("暂存 src/App.tsx")?.click());

    expect(onGitAction).toHaveBeenNthCalledWith(1, { type: "stageAll" });
    expect(onGitAction).toHaveBeenNthCalledWith(2, { type: "stageFile", path: "src/App.tsx" });
  });

  it("将同一文件分别展示在已暂存和未暂存列表", async () => {
    const onGitAction = vi.fn(() => Promise.resolve(true));
    await renderPanel({
      branch: "main",
      clean: false,
      additions: 2,
      deletions: 1,
      files: [{ code: "MM", path: "src/App.tsx" }],
    }, onGitAction);

    expect(container?.textContent).toContain("已暂存的更改");
    expect(container?.textContent).toContain("未暂存的更改");
    expect(container?.querySelectorAll('button[title="src/App.tsx"]')).toHaveLength(2);

    act(() => findButton("取消暂存 src/App.tsx")?.click());
    act(() => findButton("暂存 src/App.tsx")?.click());
    expect(onGitAction).toHaveBeenNthCalledWith(1, { type: "unstageFile", path: "src/App.tsx" });
    expect(onGitAction).toHaveBeenNthCalledWith(2, { type: "stageFile", path: "src/App.tsx" });
  });

  it("使用自动消失的悬浮提示展示 Git 操作结果", async () => {
    vi.useFakeTimers();
    const onNoticeDismiss = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<GitNoticeToast message="已取消全部暂存" onDismiss={onNoticeDismiss} />);
    });

    const notice = document.querySelector<HTMLElement>('[role="status"]');
    expect(notice?.textContent).toContain("已取消全部暂存");
    expect(notice?.className).toContain("fixed");

    act(() => vi.advanceTimersByTime(2400));
    expect(onNoticeDismiss).toHaveBeenCalledOnce();
  });

  it("提交暂存区并确认拉取和推送", async () => {
    const onGitAction = vi.fn(() => Promise.resolve(true));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await renderPanel({
      branch: "main",
      clean: false,
      additions: 2,
      deletions: 1,
      files: [{ code: "M ", path: "src/App.tsx" }],
    }, onGitAction);

    const input = container?.querySelector<HTMLInputElement>('input[aria-label="Git 提交信息"]');
    await act(async () => {
      if (!input) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "feat: add git controls");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => findButton("提交暂存的变更")?.click());
    act(() => findButton("拉取（仅快进）")?.click());
    act(() => findButton("推送当前分支")?.click());

    expect(onGitAction).toHaveBeenNthCalledWith(1, { type: "commit", message: "feat: add git controls" });
    expect(onGitAction).toHaveBeenNthCalledWith(2, { type: "pull" });
    expect(onGitAction).toHaveBeenNthCalledWith(3, { type: "push" });
  });
});

function renderPanel(status: GitStatus, onGitAction: (action: GitAction) => Promise<boolean>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  return act(async () => {
    root?.render(<TooltipProvider><GitPanel status={status} selectedPath={null} isLoading={false} error={null} operation={null} onRefresh={() => undefined} onOpenDiff={() => undefined} onGitAction={onGitAction} /></TooltipProvider>);
  });
}

function findButton(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === label || button.getAttribute("aria-label") === label);
}
