import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  relaunch: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: mocks.relaunch }));

import { checkForAppUpdate, downloadAppUpdate, installDownloadedAppUpdate, relaunchApp } from "@/lib/app-update";
import type { Update } from "@tauri-apps/plugin-updater";

afterEach(() => {
  vi.clearAllMocks();
});

describe("app update", () => {
  it("检查到已发布的新版本", () => {
    const update = { version: "0.1.7" };
    mocks.check.mockResolvedValue(update);

    return checkForAppUpdate("0.1.6").then((result) => {
      expect(result).toEqual({
        currentVersion: "0.1.6",
        latestVersion: "0.1.7",
        update,
      });
      expect(mocks.check).toHaveBeenCalledOnce();
    });
  });

  it("没有新版本时返回当前版本", () => {
    mocks.check.mockResolvedValue(null);

    return checkForAppUpdate("0.1.6").then((result) => {
      expect(result).toEqual({
        currentVersion: "0.1.6",
        latestVersion: "0.1.6",
        update: null,
      });
    });
  });

  it("下载更新后不安装或重启", () => {
    const download = vi.fn(() => Promise.resolve());
    const install = vi.fn(() => Promise.resolve());
    const onProgress = vi.fn();

    return downloadAppUpdate({ version: "0.1.7", download, install } as unknown as Update, onProgress).then(() => {
      expect(download).toHaveBeenCalledWith(onProgress);
      expect(install).not.toHaveBeenCalled();
      expect(mocks.relaunch).not.toHaveBeenCalled();
    });
  });

  it("安装已下载的更新时不隐式重启应用", () => {
    const install = vi.fn(() => Promise.resolve());
    mocks.relaunch.mockResolvedValue(undefined);

    return installDownloadedAppUpdate({ version: "0.1.7", install } as unknown as Update).then(() => {
      expect(install).toHaveBeenCalledOnce();
      expect(mocks.relaunch).not.toHaveBeenCalled();
    });
  });

  it("显式重新启动应用", () => {
    mocks.relaunch.mockResolvedValue(undefined);

    return relaunchApp().then(() => expect(mocks.relaunch).toHaveBeenCalledOnce());
  });

  it("安装失败时不重新启动", () => {
    const install = vi.fn(() => Promise.reject(new Error("安装错误")));
    mocks.relaunch.mockResolvedValue(undefined);

    return installDownloadedAppUpdate({ version: "0.1.7", install } as unknown as Update)
      .then(() => { throw new Error("应当抛出安装错误"); })
      .catch((error) => {
        expect(error.message).toBe("安装错误");
        expect(mocks.relaunch).not.toHaveBeenCalled();
      });
  });
});
