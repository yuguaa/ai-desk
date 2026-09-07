// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FilePreview, GitStatus, WorkspaceFile } from "@/types/workspace";
import type { WorkspaceChangedEvent } from "@/lib/workspace-bridge";

const bridge = vi.hoisted(() => ({
  listWorkspaceFiles: vi.fn(), getGitStatus: vi.fn(), readWorkspaceFile: vi.fn(),
  getGitDiff: vi.fn(), getGitSnapshotDiff: vi.fn(), getGitSnapshotDiffBetween: vi.fn(),
  runGitAction: vi.fn(), startWorkspaceWatch: vi.fn(), stopWorkspaceWatch: vi.fn(),
  listenWorkspaceChanges: vi.fn(),
}));
vi.mock("@/lib/workspace-bridge", () => bridge);
import { useWorkspaceInspector } from "@/hooks/use-workspace-inspector";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
let root: Root;
let container: HTMLDivElement;
let inspector: ReturnType<typeof useWorkspaceInspector>;
let listeners: Array<(event: WorkspaceChangedEvent) => void>;
let dispose: ReturnType<typeof vi.fn<() => void>>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const files = (path: string): WorkspaceFile[] => [{ path, name: path, kind: "file", size: 1 }];
const status = (branch: string): GitStatus => ({ branch, clean: true, additions: 0, deletions: 0, files: [] });
const text = (path: string): FilePreview => ({ kind: "text", path, language: "text", content: path });
function Harness({ cwd }: { cwd: string }) { inspector = useWorkspaceInspector(cwd); return null; }
function render(cwd = "/a", strict = false) {
  return act(() => { root.render(strict ? <StrictMode><Harness cwd={cwd} /></StrictMode> : <Harness cwd={cwd} />); });
}
function emit(cwd = "/a", count = 1) {
  return act(() => { for (let i = 0; i < count; i++) listeners.forEach((listener) => listener({ cwd })); });
}
function tick(ms = 100) { return act(() => vi.advanceTimersByTimeAsync(ms)); }

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  listeners = [];
  dispose = vi.fn();
  bridge.listWorkspaceFiles.mockImplementation((cwd: string) => Promise.resolve(files(cwd)));
  bridge.getGitStatus.mockImplementation((cwd: string) => Promise.resolve(status(cwd)));
  bridge.readWorkspaceFile.mockImplementation((_cwd: string, path: string) => Promise.resolve(text(path)));
  bridge.getGitDiff.mockResolvedValue("diff");
  bridge.getGitSnapshotDiff.mockResolvedValue("snapshot");
  bridge.getGitSnapshotDiffBetween.mockResolvedValue("between");
  bridge.runGitAction.mockResolvedValue(undefined);
  bridge.startWorkspaceWatch.mockResolvedValue(undefined);
  bridge.stopWorkspaceWatch.mockResolvedValue(undefined);
  bridge.listenWorkspaceChanges.mockImplementation((listener) => { listeners.push(listener); return Promise.resolve(dispose); });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); });

describe("useWorkspaceInspector 刷新调度", () => {
  it.each([
    { strict: false, finishBeforeB: true },
    { strict: false, finishBeforeB: false },
    { strict: true, finishBeforeB: true },
    { strict: true, finishBeforeB: false },
  ])("A→空→B 后仍可刷新（StrictMode=$strict，A 在 B 挂载前结束=$finishBeforeB）", async ({ strict, finishBeforeB }) => {
    const oldFiles = deferred<WorkspaceFile[]>();
    const oldGit = deferred<GitStatus>();
    bridge.listWorkspaceFiles.mockReturnValueOnce(oldFiles.promise);
    bridge.getGitStatus.mockReturnValueOnce(oldGit.promise);
    await render("/a", strict);
    await emit("/a", 100);
    await render("", strict);
    expect(inspector.isLoading).toBe(false);
    expect(inspector.files).toEqual([]);
    expect(bridge.listWorkspaceFiles.mock.calls).toEqual([["/a"]]);

    if (!finishBeforeB) await render("/b", strict);
    await act(() => oldFiles.resolve(files("obsolete")));
    expect(bridge.listWorkspaceFiles.mock.calls).toEqual([["/a"]]);
    await act(() => oldGit.reject(new Error("obsolete git error")));
    if (finishBeforeB) {
      expect(inspector.files).toEqual([]);
      expect(inspector.gitStatus).toBeNull();
      expect(inspector.error).toBeNull();
      expect(bridge.listWorkspaceFiles.mock.calls).toEqual([["/a"]]);
      await render("/b", strict);
    }

    expect(bridge.listWorkspaceFiles.mock.calls).toEqual([["/a"], ["/b"]]);
    expect(bridge.getGitStatus.mock.calls).toEqual([["/a"], ["/b"]]);
    expect(inspector.files).toEqual(files("/b"));
    expect(inspector.gitStatus).toEqual(status("/b"));
    expect(inspector.error).toBeNull();
    expect(inspector.isLoading).toBe(false);
    await act(() => inspector.refresh());
    expect(bridge.listWorkspaceFiles.mock.calls).toEqual([["/a"], ["/b"], ["/b"]]);
    expect(bridge.getGitStatus.mock.calls).toEqual([["/a"], ["/b"], ["/b"]]);
    expect(inspector.isLoading).toBe(false);
  });

  it.each([false, true])("100 个空闲事件仅触发一批刷新（StrictMode=%s）", async (strict) => {
    await render("/a", strict);
    const initialFiles = bridge.listWorkspaceFiles.mock.calls.length;
    const initialGit = bridge.getGitStatus.mock.calls.length;
    await emit("/a", 100);
    await tick(99);
    expect(bridge.listWorkspaceFiles).toHaveBeenCalledTimes(initialFiles);
    expect(bridge.getGitStatus).toHaveBeenCalledTimes(initialGit);
    await tick(1);
    expect(bridge.listWorkspaceFiles).toHaveBeenCalledTimes(initialFiles + 1);
    expect(bridge.getGitStatus).toHaveBeenCalledTimes(initialGit + 1);
    await tick(500);
    expect(bridge.listWorkspaceFiles).toHaveBeenCalledTimes(initialFiles + 1);
    expect(bridge.getGitStatus).toHaveBeenCalledTimes(initialGit + 1);
    expect(inspector.isLoading).toBe(false);
  });

  it("空闲事件防抖、忽略其他目录且保留预览", async () => {
    await render();
    await act(() => inspector.openFile("selected"));
    await emit("/other", 50);
    await tick();
    expect(bridge.listWorkspaceFiles).toHaveBeenCalledTimes(1);
    await emit("/a", 100);
    await tick(99);
    expect(bridge.listWorkspaceFiles).toHaveBeenCalledTimes(1);
    await emit();
    await tick(99);
    expect(bridge.listWorkspaceFiles).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(bridge.listWorkspaceFiles).toHaveBeenCalledTimes(2);
    expect(bridge.getGitStatus).toHaveBeenCalledTimes(2);
    expect(inspector.preview).toMatchObject({ path: "selected" });
  });

  it("等待两个接口全部结束后只执行一次尾随刷新，手动刷新等待尾随完成", async () => {
    const firstFiles = deferred<WorkspaceFile[]>();
    const firstGit = deferred<GitStatus>();
    const trailingFiles = deferred<WorkspaceFile[]>();
    bridge.listWorkspaceFiles.mockReturnValueOnce(firstFiles.promise).mockReturnValueOnce(trailingFiles.promise);
    bridge.getGitStatus.mockReturnValueOnce(firstGit.promise);
    await render();
    await emit("/a", 100);
    let finished = false;
    act(() => { void inspector.refresh().then(() => { finished = true; }); });
    await act(() => firstFiles.resolve(files("first")));
    await tick(500);
    expect(bridge.listWorkspaceFiles).toHaveBeenCalledTimes(1);
    await act(() => firstGit.resolve(status("first")));
    expect(bridge.listWorkspaceFiles).toHaveBeenCalledTimes(2);
    expect(inspector.isLoading).toBe(true);
    expect(finished).toBe(false);
    await act(() => trailingFiles.resolve(files("last")));
    await tick(500);
    expect(finished).toBe(true);
    expect(inspector.isLoading).toBe(false);
    expect(inspector.files).toEqual(files("last"));
    expect(bridge.listWorkspaceFiles).toHaveBeenCalledTimes(2);
    expect(bridge.getGitStatus).toHaveBeenCalledTimes(2);
  });

  it("尾随批次期间的新事件不会丢失，也不会并发执行", async () => {
    const first = deferred<WorkspaceFile[]>();
    const second = deferred<WorkspaceFile[]>();
    bridge.listWorkspaceFiles.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await render();
    await emit("/a", 100);
    await act(() => first.resolve([]));
    await emit("/a", 100);
    expect(bridge.listWorkspaceFiles).toHaveBeenCalledTimes(2);
    await act(() => second.resolve([]));
    expect(bridge.listWorkspaceFiles).toHaveBeenCalledTimes(3);
    expect(inspector.isLoading).toBe(false);
  });

  it("跨 cwd 保持 single-flight，仅加载最后目录且丢弃旧错误", async () => {
    const old = deferred<WorkspaceFile[]>();
    const current = deferred<WorkspaceFile[]>();
    bridge.listWorkspaceFiles.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    await render();
    await emit();
    await render("/b");
    await render("/c");
    expect(bridge.listWorkspaceFiles).toHaveBeenCalledTimes(1);
    await act(() => old.reject(new Error("old error")));
    expect(bridge.listWorkspaceFiles.mock.calls).toEqual([["/a"], ["/c"]]);
    expect(inspector.error).toBeNull();
    expect(inspector.gitStatus).toBeNull();
    expect(inspector.isLoading).toBe(true);
    await act(() => current.resolve(files("current")));
    expect(inspector.files).toEqual(files("current"));
    expect(inspector.gitStatus?.branch).toBe("/c");
    expect(inspector.isLoading).toBe(false);
  });

  it("目录 A→B→A 和 StrictMode 重建均不接收旧生命周期结果", async () => {
    const old = deferred<WorkspaceFile[]>();
    const current = deferred<WorkspaceFile[]>();
    bridge.listWorkspaceFiles.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    await render("/a", true);
    await render("/b", true);
    await render("/a", true);
    await act(() => old.resolve(files("obsolete")));
    expect(inspector.files).toEqual([]);
    expect(bridge.listWorkspaceFiles).toHaveBeenCalledTimes(2);
    await act(() => current.resolve(files("new")));
    expect(inspector.files).toEqual(files("new"));
  });

  it("空目录取消尾随刷新，旧响应不恢复数据", async () => {
    const old = deferred<WorkspaceFile[]>();
    bridge.listWorkspaceFiles.mockReturnValueOnce(old.promise);
    await render();
    await emit();
    await render("");
    await act(() => old.resolve(files("old")));
    expect(inspector.files).toEqual([]);
    expect(inspector.gitStatus).toBeNull();
    expect(inspector.isLoading).toBe(false);
    expect(bridge.listWorkspaceFiles).toHaveBeenCalledTimes(1);
  });

  it("保留接口部分失败的原有状态及错误，后续刷新可恢复", async () => {
    bridge.listWorkspaceFiles.mockRejectedValueOnce(new Error("files failed"));
    await render();
    expect(inspector.files).toEqual([]);
    expect(inspector.gitStatus?.branch).toBe("/a");
    expect(inspector.error).toBe("files failed");
    expect(inspector.isLoading).toBe(false);
    await act(() => inspector.refresh());
    expect(inspector.error).toBeNull();
    expect(inspector.files).toEqual(files("/a"));
  });

  it("切换目录清理防抖计时器，旧监听回调不再刷新", async () => {
    await render();
    await emit();
    await render("/b");
    await emit("/a", 100);
    await tick(500);
    expect(bridge.listWorkspaceFiles.mock.calls).toEqual([["/a"], ["/b"]]);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

describe("useWorkspaceInspector 请求竞态", () => {
  it("文件与 diff 共用最新请求序号，旧成功和错误均被丢弃", async () => {
    const oldFile = deferred<FilePreview>();
    const oldDiff = deferred<string>();
    bridge.readWorkspaceFile.mockReturnValueOnce(oldFile.promise);
    bridge.getGitDiff.mockReturnValueOnce(oldDiff.promise);
    await render();
    await act(() => inspector.openFile("old-file"));
    await act(() => inspector.openDiff("old-diff"));
    await act(() => inspector.openDiff("latest", "base", "end"));
    await act(() => oldFile.resolve(text("old-file")));
    await act(() => oldDiff.reject(new Error("obsolete")));
    expect(inspector.preview).toMatchObject({ mode: "diff", path: "latest", content: "between" });
    expect(inspector.selectedPath).toBe("latest");
    expect(inspector.error).toBeNull();
    expect(bridge.getGitSnapshotDiffBetween).toHaveBeenCalledWith("/a", "base", "end", "latest");
  });

  it.each(["close", "refresh", "cwd"])("%s 使未完成预览失效", async (action) => {
    const pending = deferred<string>();
    bridge.getGitSnapshotDiff.mockReturnValueOnce(pending.promise);
    await render();
    await act(() => inspector.openDiff("old", "base"));
    if (action === "close") await act(() => inspector.closePreview());
    if (action === "refresh") await act(() => inspector.refresh());
    if (action === "cwd") await render("/b");
    await act(() => pending.resolve("old"));
    expect(inspector.preview).toBeNull();
    expect(inspector.selectedPath).toBeNull();
  });

  it("当前预览失败仍显示错误", async () => {
    bridge.readWorkspaceFile.mockRejectedValueOnce(new Error("read failed"));
    await render();
    await act(() => inspector.openFile("broken"));
    expect(inspector.error).toBe("read failed");
  });

  it("旧目录 Git 操作完成后不刷新或污染新目录", async () => {
    const operation = deferred<void>();
    bridge.runGitAction.mockReturnValueOnce(operation.promise);
    await render();
    let result: Promise<boolean>;
    act(() => { result = inspector.runGitAction({ type: "stageAll" }); });
    await render("/b");
    await act(() => operation.resolve());
    expect(await result!).toBe(false);
    expect(bridge.listWorkspaceFiles.mock.calls).toEqual([["/a"], ["/b"]]);
    expect(inspector.gitNotice).toBeNull();
    expect(inspector.gitOperation).toBeNull();
  });

  it("Git 操作等待尾随刷新完成才显示成功通知", async () => {
    const first = deferred<WorkspaceFile[]>();
    const trailing = deferred<WorkspaceFile[]>();
    bridge.listWorkspaceFiles.mockReturnValueOnce(first.promise).mockReturnValueOnce(trailing.promise);
    await render();
    let result: Promise<boolean>;
    await act(() => { result = inspector.runGitAction({ type: "stageAll" }); });
    expect(inspector.gitOperation).toBe("stageAll");
    await act(() => first.resolve(files("before")));
    expect(inspector.gitNotice).toBeNull();
    expect(inspector.gitOperation).toBe("stageAll");
    await act(() => trailing.resolve(files("after")));
    expect(await result!).toBe(true);
    expect(inspector.files).toEqual(files("after"));
    expect(inspector.gitNotice).toBe("已暂存全部变更");
    expect(inspector.gitOperation).toBeNull();
  });

  it("卸载取消空闲防抖，迟到的预览错误不产生更新", async () => {
    const preview = deferred<FilePreview>();
    bridge.readWorkspaceFile.mockReturnValueOnce(preview.promise);
    await render();
    await act(() => inspector.openFile("pending"));
    await emit();
    await act(() => root.unmount());
    await act(() => preview.reject(new Error("late")));
    await tick(500);
    expect(bridge.listWorkspaceFiles).toHaveBeenCalledOnce();
    expect(inspector.error).toBeNull();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("卸载后清理迟到的监听注册，不执行尾随请求", async () => {
    const registration = deferred<() => void>();
    const pending = deferred<WorkspaceFile[]>();
    bridge.listenWorkspaceChanges.mockReturnValueOnce(registration.promise);
    bridge.listWorkspaceFiles.mockReturnValueOnce(pending.promise);
    await render();
    act(() => { void inspector.refresh(); });
    await act(() => root.unmount());
    await act(() => registration.resolve(dispose));
    await act(() => pending.resolve([]));
    await tick(500);
    expect(dispose).toHaveBeenCalledOnce();
    expect(bridge.listWorkspaceFiles).toHaveBeenCalledOnce();
  });
});
