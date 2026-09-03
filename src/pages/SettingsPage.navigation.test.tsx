// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "@/pages/SettingsPage";
import { DEFAULT_APP_SETTINGS } from "@/lib/app-settings";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const mocks = vi.hoisted(() => ({
  getVersion: vi.fn(),
  check: vi.fn(),
  relaunch: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({ getVersion: mocks.getVersion }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: mocks.relaunch }));

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeEach(() => {
  mocks.getVersion.mockReset().mockResolvedValue("0.1.6");
  mocks.check.mockReset().mockResolvedValue(null);
  mocks.relaunch.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
  root = undefined;
  container = undefined;
});

describe("SettingsPage navigation", () => {
  it("点击返回按钮回到工作区", async () => {
    const onBack = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<SettingsPage settings={DEFAULT_APP_SETTINGS} isTauri onBack={onBack} onUpdate={() => undefined} onReset={() => undefined} />);
    });

    act(() => container?.querySelector<HTMLButtonElement>('button[aria-label="返回工作区"]')?.click());

    expect(onBack).toHaveBeenCalledOnce();
    expect(container.querySelector("header")?.hasAttribute("data-tauri-drag-region")).toBe(false);
    expect(container.querySelector('[data-slot="titlebar-drag-region"]')).not.toBeNull();
  });

  it("检测到已发布的新版本并展示版本号", async () => {
    let resolveCheck: ((update: unknown) => void) | undefined;
    mocks.check.mockImplementation(() => new Promise((resolve) => { resolveCheck = resolve; }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<SettingsPage settings={DEFAULT_APP_SETTINGS} isTauri onBack={() => undefined} onUpdate={() => undefined} onReset={() => undefined} />);
      await Promise.resolve();
    });

    const checkButton = container.querySelector<HTMLButtonElement>('button[aria-label="检查应用更新"]');
    expect(container.textContent).toContain("v0.1.6");

    await act(async () => checkButton?.click());

    expect(checkButton?.disabled).toBe(true);
    expect(container.textContent).toContain("正在检查更新");

    await act(async () => {
      resolveCheck?.({ version: "0.1.7", downloadAndInstall: vi.fn() });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("发现新版本 v0.1.7");
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="立即更新应用"]')).not.toBeNull();
    expect(checkButton?.disabled).toBe(false);
  });

  it("当前版本不低于已发布版本时显示已是最新", async () => {
    mocks.check.mockResolvedValue(null);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<SettingsPage settings={DEFAULT_APP_SETTINGS} isTauri onBack={() => undefined} onUpdate={() => undefined} onReset={() => undefined} />);
      await Promise.resolve();
    });
    await act(async () => {
      container?.querySelector<HTMLButtonElement>('button[aria-label="检查应用更新"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("当前已是最新版本（v0.1.6）");
  });

  it("检测失败时显示错误并允许重新检查", async () => {
    mocks.check.mockRejectedValue(new Error("network unavailable"));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<SettingsPage settings={DEFAULT_APP_SETTINGS} isTauri onBack={() => undefined} onUpdate={() => undefined} onReset={() => undefined} />);
      await Promise.resolve();
    });
    const checkButton = container.querySelector<HTMLButtonElement>('button[aria-label="检查应用更新"]');
    await act(async () => {
      checkButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("检查更新失败，请稍后重试");
    expect(checkButton?.disabled).toBe(false);
  });

  it("点击立即更新进入安装状态并重新启动应用", async () => {
    mocks.check.mockResolvedValue({ version: "0.1.7", downloadAndInstall: vi.fn(() => Promise.resolve()) });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<SettingsPage settings={DEFAULT_APP_SETTINGS} isTauri onBack={() => undefined} onUpdate={() => undefined} onReset={() => undefined} />);
      await Promise.resolve();
    });
    await act(async () => {
      container?.querySelector<HTMLButtonElement>('button[aria-label="检查应用更新"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const installButton = container.querySelector<HTMLButtonElement>('button[aria-label="立即更新应用"]');
    await act(async () => {
      installButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("正在安装更新");
    expect(mocks.relaunch).toHaveBeenCalledOnce();
  });

  it("浏览器预览模式禁用更新检测", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<SettingsPage settings={DEFAULT_APP_SETTINGS} isTauri={false} onBack={() => undefined} onUpdate={() => undefined} onReset={() => undefined} />);
    });

    expect(container.textContent).toContain("仅桌面安装版支持检测更新");
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="检查应用更新"]')?.disabled).toBe(true);
    expect(mocks.getVersion).not.toHaveBeenCalled();
  });
});
