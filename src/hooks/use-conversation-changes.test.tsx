// @vitest-environment jsdom
import { act } from "react";
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
  it("按单个回合快照刷新，并在回合结束后冻结结果", async () => {
    await renderTracker({ c1: 0 });

    await act(async () => {
      await tracker?.startTurn({ cwd: "/demo", conversationId: "c1", turnIndex: 0, prompt: "修改当前页面" });
    });

    expect(tracker?.changesByTurn[0]).toMatchObject({ phase: "running", baselineTree: "tree-0" });

    act(() => tracker?.refreshTurn(0));

    await vi.waitFor(() => {
      expect(tracker?.changesByTurn[0]?.status).toMatchObject({ additions: 5, deletions: 2, files: [{ path: "src/App.tsx", code: "M" }] });
    });

    await renderTracker({});
    await vi.waitFor(() => {
      expect(tracker?.changesByTurn[0]?.phase).toBe("completed");
    });

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

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(bridge.getGitSnapshotStatus).toHaveBeenCalledTimes(2);
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
    root?.render(<TrackerHarness activeTurnIndexes={activeTurnIndexes} />);
    await Promise.resolve();
  });
}
