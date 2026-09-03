import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  relaunch: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: mocks.relaunch }));

import { checkForAppUpdate, installAppUpdate } from "@/lib/app-update";
import type { Update } from "@tauri-apps/plugin-updater";

afterEach(() => {
  vi.clearAllMocks();
});

describe("app update", () => {
  it("检查到已发布的新版本", () => {
    const update = { version: "0.1.7", downloadAndInstall: vi.fn() };
    mocks.check.mockResolvedValue(update);

    return checkForAppUpdate("0.1.6").then((result) => {
      expect(result).toEqual({
        currentVersion: "0.1.6",
        latestVersion: "0.1.7",
        updateAvailable: true,
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
        updateAvailable: false,
        update: null,
      });
    });
  });

  it("安装更新后重新启动应用", () => {
    const downloadAndInstall = vi.fn(() => Promise.resolve());
    mocks.relaunch.mockResolvedValue(undefined);

    return installAppUpdate({ version: "0.1.7", downloadAndInstall } as unknown as Update, () => undefined).then(() => {
      expect(downloadAndInstall).toHaveBeenCalledOnce();
      expect(mocks.relaunch).toHaveBeenCalledOnce();
    });
  });

  it("安装失败时不重新启动", () => {
    const downloadAndInstall = vi.fn(() => Promise.reject(new Error("网络错误")));
    mocks.relaunch.mockResolvedValue(undefined);

    return installAppUpdate({ version: "0.1.7", downloadAndInstall } as unknown as Update, () => undefined)
      .then(() => { throw new Error("应当抛出安装错误"); })
      .catch((error) => {
        expect(error.message).toBe("网络错误");
        expect(mocks.relaunch).not.toHaveBeenCalled();
      });
  });
});
