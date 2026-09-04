// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { DEFAULT_APP_SETTINGS } from "@/lib/app-settings";
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const mocks = vi.hoisted(() => ({
  getVersion: vi.fn(),
  checkForAppUpdate: vi.fn(),
  downloadAppUpdate: vi.fn(),
  installDownloadedAppUpdate: vi.fn(),
  relaunchApp: vi.fn(),
}));

vi.mock("@/pages/WorkspacePage", () => ({
  default: ({ onOpenSettings }: { onOpenSettings: () => void }) => <button type="button" aria-label="打开设置" onClick={onOpenSettings}>设置</button>,
}));
vi.mock("@/components/mascot/Mascot", () => ({ Mascot: () => null, mascotImageFor: () => null }));
vi.mock("@/hooks/use-app-settings", () => ({
  useAppSettings: () => ({ settings: DEFAULT_APP_SETTINGS, updateSettings: vi.fn(), resetSettings: vi.fn() }),
}));
vi.mock("@/lib/pi-bridge", () => ({ isTauriRuntime: () => true, isMacTauriRuntime: () => false }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: mocks.getVersion }));
vi.mock("@/lib/app-update", () => ({
  checkForAppUpdate: mocks.checkForAppUpdate,
  downloadAppUpdate: mocks.downloadAppUpdate,
  installDownloadedAppUpdate: mocks.installDownloadedAppUpdate,
  relaunchApp: mocks.relaunchApp,
}));

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeEach(() => {
  mocks.getVersion.mockReset().mockResolvedValue("0.1.13");
  mocks.checkForAppUpdate.mockReset();
  mocks.downloadAppUpdate.mockReset();
  mocks.installDownloadedAppUpdate.mockReset().mockResolvedValue(undefined);
  mocks.relaunchApp.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe("App update", () => {
  it("离开设置页后继续下载并保留完成状态", async () => {
    const update = { version: "0.1.14", close: vi.fn(() => Promise.resolve()) } as unknown as Update;
    let progress: ((event: DownloadEvent) => void) | undefined;
    let resolveDownload: (() => void) | undefined;
    mocks.checkForAppUpdate.mockResolvedValue({
      currentVersion: "0.1.13",
      latestVersion: "0.1.14",
      update,
    });
    mocks.downloadAppUpdate.mockImplementation((_update, onProgress) => {
      progress = onProgress;
      return new Promise<void>((resolve) => { resolveDownload = resolve; });
    });

    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
    });
    await openSettings();
    await act(async () => {
      container?.querySelector<HTMLButtonElement>('button[aria-label="检查应用更新"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => container?.querySelector<HTMLButtonElement>('button[aria-label="下载应用更新"]')?.click());
    act(() => {
      progress?.({ event: "Started", data: { contentLength: 100 } });
      progress?.({ event: "Progress", data: { chunkLength: 40 } });
    });
    expect(container?.textContent).toContain("正在下载更新 40%");

    act(() => container?.querySelector<HTMLButtonElement>('button[aria-label="返回工作区"]')?.click());
    expect(container?.querySelector('button[aria-label="打开设置"]')).not.toBeNull();
    await openSettings();
    expect(container?.textContent).toContain("正在下载更新 40%");

    act(() => container?.querySelector<HTMLButtonElement>('button[aria-label="返回工作区"]')?.click());
    await act(async () => {
      resolveDownload?.();
      await Promise.resolve();
    });
    await openSettings();
    expect(container?.textContent).toContain("已下载");
    expect(container?.querySelector('button[aria-label="安装并重启应用"]')).not.toBeNull();
    expect(mocks.installDownloadedAppUpdate).not.toHaveBeenCalled();
  });
});

async function openSettings() {
  await act(async () => {
    container?.querySelector<HTMLButtonElement>('button[aria-label="打开设置"]')?.click();
    await import("@/pages/SettingsPage");
  });
  await vi.waitFor(() => expect(container?.querySelector('button[aria-label="检查应用更新"]')).not.toBeNull());
}
