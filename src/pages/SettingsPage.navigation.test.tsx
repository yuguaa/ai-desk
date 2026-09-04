// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "@/pages/SettingsPage";
import type { AppUpdateController, AppUpdateState } from "@/hooks/use-app-update";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "@/lib/app-settings";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let appUpdate: AppUpdateController;

beforeEach(() => {
  appUpdate = createAppUpdate({ status: "idle" });
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
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
      root?.render(<SettingsPage settings={DEFAULT_APP_SETTINGS} appUpdate={appUpdate} isTauri onBack={onBack} onUpdate={() => undefined} onReset={() => undefined} />);
    });

    act(() => container?.querySelector<HTMLButtonElement>('button[aria-label="返回工作区"]')?.click());

    expect(onBack).toHaveBeenCalledOnce();
    expect(container.querySelector("header")?.hasAttribute("data-tauri-drag-region")).toBe(false);
    expect(container.querySelector('[data-slot="titlebar-drag-region"]')).not.toBeNull();
  });

  it("发现新版本后允许单独下载", async () => {
    appUpdate = createAppUpdate({ status: "available", latestVersion: "0.1.14" });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<SettingsPage settings={DEFAULT_APP_SETTINGS} appUpdate={appUpdate} isTauri onBack={() => undefined} onUpdate={() => undefined} onReset={() => undefined} />);
    });

    const checkButton = container.querySelector<HTMLButtonElement>('button[aria-label="检查应用更新"]');
    const downloadButton = container.querySelector<HTMLButtonElement>('button[aria-label="下载应用更新"]');
    expect(container.textContent).toContain("v0.1.13");
    expect(container.textContent).toContain("发现新版本 v0.1.14");
    expect(checkButton?.disabled).toBe(false);
    expect(downloadButton).not.toBeNull();

    act(() => downloadButton?.click());
    expect(appUpdate.downloadUpdate).toHaveBeenCalledOnce();
  });

  it("当前版本不低于已发布版本时显示已是最新", async () => {
    appUpdate = createAppUpdate({ status: "latest", latestVersion: "0.1.13" });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<SettingsPage settings={DEFAULT_APP_SETTINGS} appUpdate={appUpdate} isTauri onBack={() => undefined} onUpdate={() => undefined} onReset={() => undefined} />);
    });

    expect(container.textContent).toContain("当前已是最新版本（v0.1.13）");
  });

  it("检测失败时显示错误并允许重新检查", async () => {
    appUpdate = createAppUpdate({ status: "checkFailed" });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<SettingsPage settings={DEFAULT_APP_SETTINGS} appUpdate={appUpdate} isTauri onBack={() => undefined} onUpdate={() => undefined} onReset={() => undefined} />);
    });
    const checkButton = container.querySelector<HTMLButtonElement>('button[aria-label="检查应用更新"]');

    expect(container.textContent).toContain("检查更新失败，请稍后重试");
    expect(checkButton?.disabled).toBe(false);
  });

  it("下载完成后等待用户点击安装并重启", async () => {
    appUpdate = createAppUpdate({ status: "downloaded", latestVersion: "0.1.14" });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<SettingsPage settings={DEFAULT_APP_SETTINGS} appUpdate={appUpdate} isTauri onBack={() => undefined} onUpdate={() => undefined} onReset={() => undefined} />);
    });

    const installButton = container.querySelector<HTMLButtonElement>('button[aria-label="安装并重启应用"]');
    expect(container.textContent).toContain("v0.1.14 已下载，等待安装");
    expect(appUpdate.installUpdate).not.toHaveBeenCalled();

    act(() => installButton?.click());
    expect(appUpdate.installUpdate).toHaveBeenCalledOnce();
  });

  it("下载期间仍可返回工作区", async () => {
    const onBack = vi.fn();
    appUpdate = createAppUpdate({ status: "downloading", latestVersion: "0.1.14", progress: 62 });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<SettingsPage settings={DEFAULT_APP_SETTINGS} appUpdate={appUpdate} isTauri onBack={onBack} onUpdate={() => undefined} onReset={() => undefined} />);
    });

    expect(container.textContent).toContain("正在下载更新 62%");
    act(() => container?.querySelector<HTMLButtonElement>('button[aria-label="返回工作区"]')?.click());
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("更新已安装但自动重启失败时允许重新启动", async () => {
    appUpdate = createAppUpdate({ status: "restartRequired", latestVersion: "0.1.14" });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<SettingsPage settings={DEFAULT_APP_SETTINGS} appUpdate={appUpdate} isTauri onBack={() => undefined} onUpdate={() => undefined} onReset={() => undefined} />);
    });

    expect(container.textContent).toContain("更新已安装，请重新启动应用");
    act(() => container?.querySelector<HTMLButtonElement>('button[aria-label="重新启动应用"]')?.click());
    expect(appUpdate.restartApp).toHaveBeenCalledOnce();
    expect(appUpdate.installUpdate).not.toHaveBeenCalled();
  });

  it("浏览器预览模式禁用更新检测", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<SettingsPage settings={DEFAULT_APP_SETTINGS} appUpdate={appUpdate} isTauri={false} onBack={() => undefined} onUpdate={() => undefined} onReset={() => undefined} />);
    });

    expect(container.textContent).toContain("仅桌面安装版支持检测更新");
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="检查应用更新"]')?.disabled).toBe(true);
  });

  it("支持连续添加、选择和删除网络图片链接", async () => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<MascotSettingsHarness />);
    });

    const addButton = container.querySelector<HTMLButtonElement>('button[aria-label="添加看板娘图片链接"]');
    act(() => addButton?.click());
    act(() => addButton?.click());

    expect(container.querySelectorAll('input[aria-label^="看板娘图片地址 "]')).toHaveLength(3);
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="选择第 3 张网络图片"]')?.getAttribute("aria-pressed")).toBe("true");

    act(() => container?.querySelector<HTMLButtonElement>('button[aria-label="选择第 1 张网络图片"]')?.click());
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="选择第 1 张网络图片"]')?.getAttribute("aria-pressed")).toBe("true");

    act(() => container?.querySelector<HTMLButtonElement>('button[aria-label="删除第 2 个看板娘图片链接"]')?.click());
    expect(container.querySelectorAll('input[aria-label^="看板娘图片地址 "]')).toHaveLength(2);
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="选择第 1 张网络图片"]')?.getAttribute("aria-pressed")).toBe("true");

    act(() => vi.runOnlyPendingTimers());
    vi.useRealTimers();
  });
});

function MascotSettingsHarness() {
  const [settings, setSettings] = useState<AppSettings>({ ...DEFAULT_APP_SETTINGS, mascotSource: "customUrl", mascotImageUrls: ["https://example.com/first.png"] });
  const updateSettings = <K extends keyof AppSettings,>(key: K, value: AppSettings[K]) => setSettings((current) => ({ ...current, [key]: value }));
  return <SettingsPage settings={settings} appUpdate={createAppUpdate({ status: "idle" })} isTauri onBack={() => undefined} onUpdate={updateSettings} onReset={() => undefined} />;
}

function createAppUpdate(state: AppUpdateState): AppUpdateController {
  return {
    currentVersion: "0.1.13",
    state,
    canCheck: state.status === "idle" || state.status === "latest" || state.status === "checkFailed" || state.status === "available" || state.status === "downloadFailed",
    checkUpdate: vi.fn(),
    downloadUpdate: vi.fn(),
    installUpdate: vi.fn(),
    restartApp: vi.fn(),
  };
}
