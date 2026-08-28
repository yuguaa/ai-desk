import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  openDialog: vi.fn(() => Promise.resolve<string | null>("/code/new-project")),
  runtimeIsTauri: true,
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.openDialog }));
vi.mock("@/lib/pi-bridge", () => ({ isTauriRuntime: () => mocks.runtimeIsTauri }));

import { captureGitSnapshot, getGitSnapshotDiff, getGitSnapshotStatus, pickProjectDirectory, releaseGitSnapshot, runGitAction } from "@/lib/workspace-bridge";

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.openDialog.mockClear();
  mocks.runtimeIsTauri = true;
});

describe("workspace bridge", () => {
  it("请求目录选择器允许创建项目目录", () => {
    return pickProjectDirectory().then((path) => {
      expect(path).toBe("/code/new-project");
      expect(mocks.openDialog).toHaveBeenCalledWith({
        title: "新建或打开项目",
        directory: true,
        multiple: false,
        canCreateDirectories: true,
      });
    });
  });

  it("对接 Git snapshot commands", () => {
    mocks.invoke
      .mockResolvedValueOnce("baseline-tree")
      .mockResolvedValueOnce({ branch: "main", clean: false, additions: 3, deletions: 1, files: [{ path: "src/App.tsx", code: "M " }] })
      .mockResolvedValueOnce("diff --git a/src/App.tsx b/src/App.tsx");

    return captureGitSnapshot("/code/demo")
      .then((baselineTree) => {
        expect(baselineTree).toBe("baseline-tree");
        expect(mocks.invoke).toHaveBeenNthCalledWith(1, "capture_git_snapshot", { cwd: "/code/demo" });
        return getGitSnapshotStatus("/code/demo", String(baselineTree));
      })
      .then((status) => {
        expect(status).toEqual({ branch: "main", clean: false, additions: 3, deletions: 1, files: [{ path: "src/App.tsx", code: "M " }] });
        expect(mocks.invoke).toHaveBeenNthCalledWith(2, "get_git_snapshot_status", { cwd: "/code/demo", baselineTree: "baseline-tree" });
        return getGitSnapshotDiff("/code/demo", "baseline-tree", "src/App.tsx");
      })
      .then((diff) => {
        expect(diff).toBe("diff --git a/src/App.tsx b/src/App.tsx");
        expect(mocks.invoke).toHaveBeenNthCalledWith(3, "get_git_snapshot_diff", { cwd: "/code/demo", baselineTree: "baseline-tree", path: "src/App.tsx" });
        mocks.invoke.mockResolvedValueOnce(undefined);
        return releaseGitSnapshot("/code/demo", "baseline-tree");
      })
      .then(() => {
        expect(mocks.invoke).toHaveBeenNthCalledWith(4, "release_git_snapshot", { cwd: "/code/demo", snapshot: "baseline-tree" });
      });
  });

  it("浏览器预览下跳过 snapshot command", () => {
    mocks.runtimeIsTauri = false;

    return captureGitSnapshot("/code/demo")
      .then((baselineTree) => {
        expect(baselineTree).toBeNull();
        return getGitSnapshotStatus("/code/demo", "baseline-tree");
      })
      .then((status) => {
        expect(status).toBeNull();
        return getGitSnapshotDiff("/code/demo", "baseline-tree", "src/App.tsx");
      })
      .then((diff) => {
        expect(diff).toBe("");
        expect(mocks.invoke).not.toHaveBeenCalled();
      });
  });

  it("通过受限 action contract 执行 Git 写操作", () => {
    mocks.invoke.mockResolvedValue(undefined);

    return runGitAction("/code/demo", { type: "commit", message: "feat: add git controls" }).then(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("run_git_action", {
        cwd: "/code/demo",
        action: { type: "commit", message: "feat: add git controls" },
      });
    });
  });
});
