// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppUpdate, type AppUpdateController } from "@/hooks/use-app-update";
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const mocks = vi.hoisted(() => ({
  getVersion: vi.fn(),
  checkForAppUpdate: vi.fn(),
  downloadAppUpdate: vi.fn(),
  installDownloadedAppUpdate: vi.fn(),
  relaunchApp: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({ getVersion: mocks.getVersion }));
vi.mock("@/lib/app-update", () => ({
  checkForAppUpdate: mocks.checkForAppUpdate,
  downloadAppUpdate: mocks.downloadAppUpdate,
  installDownloadedAppUpdate: mocks.installDownloadedAppUpdate,
  relaunchApp: mocks.relaunchApp,
}));

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let controller: AppUpdateController | undefined;

beforeEach(() => {
  mocks.getVersion.mockReset().mockResolvedValue("0.1.13");
  mocks.checkForAppUpdate.mockReset();
  mocks.downloadAppUpdate.mockReset();
  mocks.installDownloadedAppUpdate.mockReset();
  mocks.relaunchApp.mockReset();
  controller = undefined;
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

describe("useAppUpdate", () => {
  it("下载完成后等待用户触发安装", async () => {
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
    mocks.installDownloadedAppUpdate.mockResolvedValue(undefined);
    mocks.relaunchApp.mockResolvedValue(undefined);

    await act(async () => {
      root?.render(<UpdateProbe onChange={(value) => { controller = value; }} />);
      await Promise.resolve();
    });
    await act(async () => {
      controller?.checkUpdate();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(controller?.state).toEqual({ status: "available", latestVersion: "0.1.14" });

    act(() => controller?.downloadUpdate());
    act(() => {
      progress?.({ event: "Started", data: { contentLength: 100 } });
      progress?.({ event: "Progress", data: { chunkLength: 35 } });
    });
    expect(controller?.state).toEqual({ status: "downloading", latestVersion: "0.1.14", progress: 35 });
    expect(mocks.installDownloadedAppUpdate).not.toHaveBeenCalled();

    await act(async () => {
      resolveDownload?.();
      await Promise.resolve();
    });
    expect(controller?.state).toEqual({ status: "downloaded", latestVersion: "0.1.14" });
    expect(mocks.installDownloadedAppUpdate).not.toHaveBeenCalled();

    act(() => progress?.({ event: "Progress", data: { chunkLength: 5 } }));
    expect(controller?.state).toEqual({ status: "downloaded", latestVersion: "0.1.14" });

    await act(async () => {
      controller?.installUpdate();
      await Promise.resolve();
    });
    expect(mocks.installDownloadedAppUpdate).toHaveBeenCalledWith(update);
    expect(mocks.relaunchApp).toHaveBeenCalledOnce();
  });

  it("更新已安装但重启失败时只重试重启", async () => {
    const update = { version: "0.1.14", close: vi.fn(() => Promise.resolve()) } as unknown as Update;
    mocks.checkForAppUpdate.mockResolvedValue({
      currentVersion: "0.1.13",
      latestVersion: "0.1.14",
      update,
    });
    mocks.downloadAppUpdate.mockResolvedValue(undefined);
    mocks.installDownloadedAppUpdate.mockResolvedValue(undefined);
    mocks.relaunchApp.mockRejectedValueOnce(new Error("重启失败"));

    await act(async () => {
      root?.render(<UpdateProbe onChange={(value) => { controller = value; }} />);
      await Promise.resolve();
    });
    await act(async () => {
      controller?.checkUpdate();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      controller?.downloadUpdate();
      await Promise.resolve();
    });
    await act(async () => {
      controller?.installUpdate();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(controller?.state).toEqual({ status: "restartRequired", latestVersion: "0.1.14" });
    expect(mocks.installDownloadedAppUpdate).toHaveBeenCalledOnce();
    expect(mocks.relaunchApp).toHaveBeenCalledOnce();

    mocks.relaunchApp.mockResolvedValue(undefined);
    await act(async () => {
      controller?.restartApp();
      await Promise.resolve();
    });
    expect(mocks.installDownloadedAppUpdate).toHaveBeenCalledOnce();
    expect(mocks.relaunchApp).toHaveBeenCalledTimes(2);
  });

  it("组件卸载后释放迟到的检查结果", async () => {
    const update = { version: "0.1.14", close: vi.fn(() => Promise.resolve()) } as unknown as Update;
    let resolveCheck: ((result: unknown) => void) | undefined;
    mocks.checkForAppUpdate.mockImplementation(() => new Promise((resolve) => { resolveCheck = resolve; }));

    await act(async () => {
      root?.render(<UpdateProbe onChange={(value) => { controller = value; }} />);
      await Promise.resolve();
    });
    act(() => controller?.checkUpdate());
    act(() => root?.unmount());
    root = undefined;
    await act(async () => {
      resolveCheck?.({
        currentVersion: "0.1.13",
        latestVersion: "0.1.14",
        update,
      });
      await Promise.resolve();
    });

    expect(update.close).toHaveBeenCalledOnce();
  });

  it("下载期间卸载后再次释放迟到的下载资源", async () => {
    const update = { version: "0.1.14", close: vi.fn(() => Promise.resolve()) } as unknown as Update;
    let resolveDownload: (() => void) | undefined;
    mocks.checkForAppUpdate.mockResolvedValue({
      currentVersion: "0.1.13",
      latestVersion: "0.1.14",
      update,
    });
    mocks.downloadAppUpdate.mockImplementation(() => new Promise<void>((resolve) => { resolveDownload = resolve; }));

    await act(async () => {
      root?.render(<UpdateProbe onChange={(value) => { controller = value; }} />);
      await Promise.resolve();
    });
    await act(async () => {
      controller?.checkUpdate();
      await Promise.resolve();
    });
    act(() => controller?.downloadUpdate());
    act(() => root?.unmount());
    root = undefined;
    await act(async () => {
      resolveDownload?.();
      await Promise.resolve();
    });

    expect(update.close).toHaveBeenCalledTimes(2);
  });
});

function UpdateProbe({ onChange }: { onChange: (controller: AppUpdateController) => void }) {
  const appUpdate = useAppUpdate(true);
  onChange(appUpdate);
  return null;
}
