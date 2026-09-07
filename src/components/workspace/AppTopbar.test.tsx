// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const windowState = vi.hoisted(() => ({
  mac: true,
  fullscreen: false,
  resized: undefined as (() => void) | undefined,
  unlisten: vi.fn(),
  isFullscreen: vi.fn(),
}));
vi.mock("@/lib/pi-bridge", () => ({ isMacTauriRuntime: () => windowState.mac }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({
  isFullscreen: windowState.isFullscreen,
  onResized: (listener: () => void) => {
    windowState.resized = listener;
    return Promise.resolve(windowState.unlisten);
  },
}) }));

import { AppTopbar } from "@/components/workspace/AppTopbar";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
let root: Root | undefined;
let container: HTMLDivElement;
beforeEach(() => {
  windowState.mac = true;
  windowState.fullscreen = false;
  windowState.resized = undefined;
  vi.clearAllMocks();
  windowState.isFullscreen.mockImplementation(() => Promise.resolve(windowState.fullscreen));
  container = document.createElement("div");
});
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
});

function mount() {
  root = createRoot(container);
  return act(() => { root?.render(<AppTopbar />); });
}

describe("AppTopbar", () => {
  it("为 macOS Tauri 渲染沉浸式拖拽标题栏", () => {
    const html = renderToStaticMarkup(<AppTopbar />);

    expect(html).toContain('data-tauri-drag-region="deep"');
    expect(html).toContain('data-immersive="true"');
    expect(html).toContain("data-[immersive=true]:h-[52px]");
    expect(html).toContain("data-[immersive=true]:pl-[76px]");
    expect(html).toContain("bg-[var(--bg-titlebar)]");
    expect(html).toContain("AI DESK");
    expect(html).not.toContain("<img");
  });

  it("进入全屏移除标题栏占位，退出全屏恢复", async () => {
    await mount();
    expect(container.querySelector("header")).not.toBeNull();
    windowState.fullscreen = true;
    await act(() => windowState.resized?.());
    expect(container.querySelector("header")).toBeNull();
    windowState.fullscreen = false;
    await act(() => windowState.resized?.());
    expect(container.querySelector("header")).not.toBeNull();
  });

  it("挂载时已全屏也不保留标题栏", async () => {
    windowState.fullscreen = true;
    await mount();
    expect(container.querySelector("header")).toBeNull();
  });

  it("浏览器不调用原生窗口接口", async () => {
    windowState.mac = false;
    await mount();
    expect(windowState.isFullscreen).not.toHaveBeenCalled();
    expect(container.querySelector("header")).not.toBeNull();
  });

  it("卸载时清理窗口监听", async () => {
    await mount();
    act(() => root?.unmount());
    root = undefined;
    expect(windowState.unlisten).toHaveBeenCalledOnce();
  });
});
