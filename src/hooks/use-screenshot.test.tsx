// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { useScreenshot } from "./use-screenshot";
import { useImageDrafts } from "./use-image-drafts";
import { isMacTauriRuntime } from "@/lib/pi-bridge";
import { captureScreenshot, listenScreenshotError, listenScreenshotRequested } from "@/lib/screenshot-bridge";

vi.mock("@/lib/pi-bridge", () => ({ isMacTauriRuntime: vi.fn() }));
vi.mock("@/lib/screenshot-bridge", { spy: true });
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const image: Awaited<ReturnType<typeof captureScreenshot>>[number] = { id: "00000000-0000-4000-8000-000000000001", name: "截图.png", type: "image", mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZe0AAAAASUVORK5CYII=" };
let root: Root;
let container: HTMLDivElement;
let draft: ReturnType<typeof useImageDrafts>;
let capture: ReturnType<typeof useScreenshot>;
let requested: () => void;
let reportError: (message: string) => void;
let unlistenRequested: Mock<() => void>;
let unlistenError: Mock<() => void>;

function Harness({ draftKey, canCapture, onCaptured }: { draftKey: string; canCapture: boolean; onCaptured?: () => void }) {
  draft = useImageDrafts(draftKey);
  capture = useScreenshot(draft, canCapture, onCaptured);
  return null;
}

const render = (draftKey = "one", canCapture = true, onCaptured?: () => void) => act(() => root.render(<Harness draftKey={draftKey} canCapture={canCapture} onCaptured={onCaptured} />));

beforeEach(() => {
  vi.mocked(isMacTauriRuntime).mockReturnValue(true);
  vi.mocked(captureScreenshot).mockReset().mockResolvedValue([image]);
  unlistenRequested = vi.fn();
  unlistenError = vi.fn();
  vi.mocked(listenScreenshotRequested).mockReset().mockImplementation((handler) => { requested = handler; return Promise.resolve(unlistenRequested); });
  vi.mocked(listenScreenshotError).mockReset().mockImplementation((handler) => { reportError = handler; return Promise.resolve(unlistenError); });
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useScreenshot", () => {
  it("快捷键事件触发的异步截图写回原草稿，完成前不激活窗口", async () => {
    let finish!: (images: Awaited<ReturnType<typeof captureScreenshot>>) => void;
    vi.mocked(captureScreenshot).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const onCaptured = vi.fn();
    await render("one", true, onCaptured);
    expect(captureScreenshot).not.toHaveBeenCalled();
    await act(() => requested());
    expect(captureScreenshot).toHaveBeenCalledOnce();
    expect(draft.pending).toBe(1);
    expect(onCaptured).not.toHaveBeenCalled();
    await render("two", true, onCaptured);
    await act(() => finish([image]));
    expect(draft.images).toEqual([]);
    expect(draft.pending).toBe(0);
    expect(onCaptured).toHaveBeenCalledOnce();
    await render("one", true, onCaptured);
    expect(draft.images).toEqual([image]);
    expect(draft.pending).toBe(0);
    expect(listenScreenshotRequested).toHaveBeenCalledOnce();
  });

  it("手动入口和监听事件使用当前项目状态，无项目时不捕获", async () => {
    const onCaptured = vi.fn();
    await render("one", true, onCaptured);
    const firstCapture = capture;
    await render("none", false, onCaptured);
    expect(capture).toBe(firstCapture);
    await act(() => { requested(); capture?.(); });
    expect(captureScreenshot).not.toHaveBeenCalled();
    expect(draft.pending).toBe(0);
    expect(draft.error).toBe("请先选择项目，再截取窗口");
    await render("two", true, onCaptured);
    await act(() => capture?.());
    expect(captureScreenshot).toHaveBeenCalledOnce();
    expect(draft.images).toEqual([image]);
  });

  it("卸载时注销事件监听", async () => {
    await render();
    await act(() => root.render(null));
    expect(unlistenRequested).toHaveBeenCalledOnce();
    expect(unlistenError).toHaveBeenCalledOnce();
  });

  it("卸载后才注册完成的监听也立即注销", async () => {
    let finishRequested!: (cleanup: () => void) => void;
    let finishError!: (cleanup: () => void) => void;
    vi.mocked(listenScreenshotRequested).mockReturnValueOnce(new Promise((resolve) => { finishRequested = resolve; }));
    vi.mocked(listenScreenshotError).mockReturnValueOnce(new Promise((resolve) => { finishError = resolve; }));
    await render();
    await act(() => root.render(null));
    await act(() => { finishRequested(unlistenRequested); finishError(unlistenError); });
    expect(unlistenRequested).toHaveBeenCalledOnce();
    expect(unlistenError).toHaveBeenCalledOnce();
  });

  it("监听错误写入当前草稿，不污染之前的会话", async () => {
    await render("one");
    await render("two");
    await act(() => reportError("输入监控已断开"));
    expect(draft.error).toBe("输入监控已断开");
    await render("one");
    expect(draft.error).toBeNull();
  });

  it("截图权限拒绝时保留原草稿附件并结束加载", async () => {
    vi.mocked(captureScreenshot).mockRejectedValueOnce(new Error("未获得屏幕录制权限"));
    await render();
    act(() => draft.set([image]));
    await act(() => requested());
    expect(draft.images).toEqual([image]);
    expect(draft.error).toBe("未获得屏幕录制权限");
    expect(draft.pending).toBe(0);
  });

  it("非 macOS 桌面环境不注册监听也不提供截图入口", async () => {
    vi.mocked(isMacTauriRuntime).mockReturnValue(false);
    await render();
    expect(capture).toBeUndefined();
    expect(listenScreenshotRequested).not.toHaveBeenCalled();
    expect(listenScreenshotError).not.toHaveBeenCalled();
    expect(captureScreenshot).not.toHaveBeenCalled();
  });
});
