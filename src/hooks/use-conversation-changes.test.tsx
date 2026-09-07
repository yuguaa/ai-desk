// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  captureGitSnapshot: vi.fn(() => Promise.resolve<string | null>("tree-0")),
  getGitSnapshotStatus: vi.fn(() => Promise.resolve({
    branch: "main",
    clean: false,
    additions: 5,
    deletions: 2,
    files: [{ path: "src/App.tsx", code: "M " }],
  })),
  getGitSnapshotStatusBetween: vi.fn(() => Promise.resolve({
    branch: "main",
    clean: false,
    additions: 3,
    deletions: 1,
    files: [{ path: "src/App.tsx", code: "M" }],
  })),
  getGitSnapshotStatusScoped: vi.fn((_cwd: string, _baseline: string, _end: string, paths: string[]) => Promise.resolve({
    branch: "main",
    clean: paths.length === 0,
    additions: paths.length ? 1 : 0,
    deletions: 0,
    files: paths.map((path) => ({ path, code: "M" })),
  })),
  revertGitSnapshot: vi.fn(() => Promise.resolve()),
  releaseGitSnapshot: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/workspace-bridge", () => bridge);

import { useConversationChanges } from "@/hooks/use-conversation-changes";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let tracker: ReturnType<typeof useConversationChanges> | undefined;

beforeEach(() => {
  localStorage.clear();
  bridge.captureGitSnapshot.mockClear();
  bridge.getGitSnapshotStatus.mockClear();
  bridge.getGitSnapshotStatusBetween.mockClear();
  bridge.getGitSnapshotStatusScoped.mockClear();
  bridge.revertGitSnapshot.mockClear();
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  vi.useRealTimers();
  container?.remove();
  root = undefined;
  container = undefined;
  tracker = undefined;
});

describe("useConversationChanges", () => {
  it("队列启动下一回合前等待上一回合的结束快照", async () => {
    await renderTracker({ c1: 0 });
    await act(async () => {
      await tracker?.startTurn({ cwd: "/demo", conversationId: "c1", turnIndex: 0, prompt: "第一轮" });
    });
    let finish!: (tree: string) => void;
    bridge.captureGitSnapshot.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    let nextTurn!: Promise<void>;
    await act(async () => {
      nextTurn = tracker!.startTurn({ cwd: "/demo", conversationId: "c1", turnIndex: 1, prompt: "第二轮" });
    });
    expect(bridge.captureGitSnapshot).toHaveBeenCalledTimes(2);
    expect(tracker?.changesByTurn[1]).toBeUndefined();
    await act(async () => { finish("first-end"); await nextTurn; });
    expect(tracker?.changesByTurn[0]).toMatchObject({ phase: "completed", endTree: "first-end" });
    expect(tracker?.changesByTurn[1]).toMatchObject({ phase: "running", baselineTree: "tree-0" });
  });

  it("慢轮询不叠加，迟到响应不能覆盖结束统计", async () => {
    vi.useFakeTimers();
    let resolveStatus!: (status: Awaited<ReturnType<typeof bridge.getGitSnapshotStatus>>) => void;
    bridge.getGitSnapshotStatus.mockImplementationOnce(() => new Promise((resolve) => { resolveStatus = resolve; }));
    await renderTracker({ c1: 0 });
    await act(async () => {
      await tracker?.startTurn({ cwd: "/demo", conversationId: "c1", turnIndex: 0, prompt: "修改" });
    });
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(bridge.getGitSnapshotStatus).toHaveBeenCalledTimes(1);
    await renderTracker({});
    await act(async () => {
      resolveStatus({ branch: "main", clean: true, additions: 0, deletions: 0, files: [] });
    });
    expect(tracker?.changesByTurn[0]).toMatchObject({ phase: "completed", status: { additions: 3 } });
  });

  it("收尾慢于轮询间隔时不会被轮询作废", async () => {
    vi.useFakeTimers();
    await renderTracker({ c1: 0 });
    await act(async () => {
      await tracker?.startTurn({ cwd: "/demo", conversationId: "c1", turnIndex: 0, prompt: "修改" });
    });
    let finish!: (tree: string) => void;
    bridge.captureGitSnapshot.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await renderTracker({});
    await act(() => vi.advanceTimersByTimeAsync(6_000));
    expect(bridge.getGitSnapshotStatus).toHaveBeenCalledTimes(1);
    await act(async () => { finish("end"); });
    expect(tracker?.changesByTurn[0]).toMatchObject({ phase: "completed", endTree: "end" });
  });

  it("撤销全部直接清空范围，刷新不能重新出现", async () => {
    await renderTracker({ c1: 0 });
    await act(async () => {
      await tracker?.startTurn({ cwd: "/demo", conversationId: "c1", turnIndex: 0, prompt: "修改" });
    });
    await renderTracker({});
    await act(async () => { expect(await tracker?.revertTurn(0)).toBe(true); });
    expect(bridge.getGitSnapshotStatusScoped).toHaveBeenLastCalledWith("/demo", "tree-0", "tree-0", []);
    expect(tracker?.changesByTurn[0]?.status).toBeNull();
    await act(async () => { tracker?.refreshTurn(0); });
    expect(tracker?.changesByTurn[0]?.status).toBeNull();
  });

  it("收尾失败明确保存错误，不伪装为零变更", async () => {
    await renderTracker({ c1: 0 });
    await act(async () => {
      await tracker?.startTurn({ cwd: "/demo", conversationId: "c1", turnIndex: 0, prompt: "修改" });
    });
    bridge.captureGitSnapshot.mockRejectedValueOnce(new Error("快照失败"));
    await renderTracker({});
    expect(tracker?.changesByTurn[0]).toMatchObject({ phase: "completed", endTree: null, error: "Error: 快照失败" });
  });

  it("运行期实时刷新，结束后冻结为本回合快照差异", async () => {
    await renderTracker({ c1: 0 });

    await act(async () => {
      await tracker?.startTurn({ cwd: "/demo", conversationId: "c1", turnIndex: 0, prompt: "修改当前页面" });
    });

    expect(tracker?.changesByTurn[0]).toMatchObject({ phase: "running", baselineTree: "tree-0", endTree: null });

    await vi.waitFor(() => {
      expect(tracker?.changesByTurn[0]?.status).toMatchObject({ additions: 5, deletions: 2, files: [{ path: "src/App.tsx", code: "M" }] });
    });

    await renderTracker({});
    await vi.waitFor(() => {
      expect(tracker?.changesByTurn[0]).toMatchObject({
        phase: "completed",
        endTree: "tree-0",
        status: { additions: 3, deletions: 1, files: [{ path: "src/App.tsx", code: "M" }] },
      });
    });

    expect(bridge.getGitSnapshotStatusBetween).toHaveBeenCalledWith("/demo", "tree-0", "tree-0");
    expect(JSON.parse(localStorage.getItem("ai-desk.conversation-turn-changes") ?? "{}")).toHaveProperty("/demo::c1::0");
  });

  it("回合运行期间自动刷新变更状态", async () => {
    vi.useFakeTimers();
    await renderTracker({ c1: 0 });

    await act(async () => {
      await tracker?.startTurn({ cwd: "/demo", conversationId: "c1", turnIndex: 0, prompt: "修改当前页面" });
      await Promise.resolve();
    });

    expect(bridge.getGitSnapshotStatus).toHaveBeenCalledTimes(1);
    const unchanged = tracker?.changesByTurn;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(bridge.getGitSnapshotStatus).toHaveBeenCalledTimes(2);
    expect(tracker?.changesByTurn).toBe(unchanged);
  });

  it("撤销全部后状态清空，单个撤销仅移除对应文件", async () => {
    await renderTracker({ c1: 0 });

    await act(async () => {
      await tracker?.startTurn({ cwd: "/demo", conversationId: "c1", turnIndex: 0, prompt: "修改当前页面" });
    });
    await renderTracker({});
    await vi.waitFor(() => {
      expect(tracker?.changesByTurn[0]?.phase).toBe("completed");
    });

    await act(async () => {
      const ok = await tracker?.revertTurn(0, "src/App.tsx");
      expect(ok).toBe(true);
    });

    expect(bridge.revertGitSnapshot).toHaveBeenCalledWith("/demo", "tree-0", "tree-0", "src/App.tsx");
    await vi.waitFor(() => {
      expect(tracker?.changesByTurn[0]?.status).toBeNull();
    });

    await act(async () => {
      const ok = await tracker?.revertTurn(0);
      expect(ok).toBe(true);
    });

    expect(bridge.revertGitSnapshot).toHaveBeenLastCalledWith("/demo", "tree-0", "tree-0", null);
  });
});

function TrackerHarness({ activeTurnIndexes }: { activeTurnIndexes: Record<string, number> }) {
  tracker = useConversationChanges("/demo", "c1", activeTurnIndexes);
  return null;
}

function renderTracker(activeTurnIndexes: Record<string, number>) {
  if (!container) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }

  return act(async () => {
    root?.render(<StrictMode><TrackerHarness activeTurnIndexes={activeTurnIndexes} /></StrictMode>);
    await Promise.resolve();
  });
}
