// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScreenshotSettings } from "./ScreenshotSettings";
import { getScreenshotStatus, requestScreenshotPermission, setScreenshotShortcutEnabled, type ScreenshotStatus } from "@/lib/screenshot-bridge";

vi.mock("@/lib/screenshot-bridge", { spy: true });
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const initialStatus: ScreenshotStatus = { supported: true, screenRecordingGranted: false, inputMonitoringGranted: false, shortcutEnabled: false };
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.mocked(getScreenshotStatus).mockReset().mockResolvedValue(initialStatus);
  vi.mocked(setScreenshotShortcutEnabled).mockReset().mockImplementation((enabled) => Promise.resolve({ ...initialStatus, screenRecordingGranted: true, inputMonitoringGranted: true, shortcutEnabled: enabled }));
  vi.mocked(requestScreenshotPermission).mockReset().mockResolvedValue({ ...initialStatus, screenRecordingGranted: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = () => act(() => root.render(<ScreenshotSettings />));
const toggle = () => container.querySelector<HTMLButtonElement>('[role="switch"]')!;
const authorize = () => Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "授权屏幕录制");

describe("ScreenshotSettings", () => {
  it("默认和窗口重新聚焦只查询状态，不申请权限或开启快捷键", async () => {
    await render();
    expect(getScreenshotStatus).toHaveBeenCalledOnce();
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(authorize()).toBeDefined();
    await act(() => { window.dispatchEvent(new Event("focus")); });
    expect(getScreenshotStatus).toHaveBeenCalledTimes(2);
    expect(requestScreenshotPermission).not.toHaveBeenCalled();
    expect(setScreenshotShortcutEnabled).not.toHaveBeenCalled();
    await act(() => root.render(null));
    await act(() => { window.dispatchEvent(new Event("focus")); });
    expect(getScreenshotStatus).toHaveBeenCalledTimes(2);
  });

  it("显式开启和关闭快捷键，并展示桥接返回状态", async () => {
    await render();
    await act(() => toggle().click());
    expect(setScreenshotShortcutEnabled).toHaveBeenLastCalledWith(true);
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    await act(() => toggle().click());
    expect(setScreenshotShortcutEnabled).toHaveBeenLastCalledWith(false);
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(requestScreenshotPermission).not.toHaveBeenCalled();
  });

  it("快捷键授权拒绝时保留关闭状态并呈现错误，重试成功清除错误", async () => {
    vi.mocked(setScreenshotShortcutEnabled).mockRejectedValueOnce({ code: "input_monitoring_denied", message: "未获得输入监控权限" });
    await render();
    await act(() => toggle().click());
    expect(container.querySelector('[role="alert"]')!.textContent).toBe("未获得输入监控权限");
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(toggle().disabled).toBe(false);
    await act(() => toggle().click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(toggle().getAttribute("aria-checked")).toBe("true");
  });

  it("独立授权屏幕录制，不开启快捷键或请求输入监控", async () => {
    await render();
    await act(() => authorize()!.click());
    expect(requestScreenshotPermission).toHaveBeenCalledExactlyOnceWith("screenRecording");
    expect(setScreenshotShortcutEnabled).not.toHaveBeenCalled();
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(authorize()).toBeUndefined();
  });

  it("屏幕录制授权拒绝后显示错误且保留授权入口", async () => {
    vi.mocked(requestScreenshotPermission).mockRejectedValueOnce({ code: "screen_recording_denied", message: "未获得屏幕录制权限" });
    await render();
    await act(() => authorize()!.click());
    expect(container.querySelector('[role="alert"]')!.textContent).toBe("未获得屏幕录制权限");
    expect(authorize()!.disabled).toBe(false);
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(setScreenshotShortcutEnabled).not.toHaveBeenCalled();
  });

  it("授权处理中禁用重复操作", async () => {
    let finish!: (status: ScreenshotStatus) => void;
    vi.mocked(requestScreenshotPermission).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await render();
    await act(() => authorize()!.click());
    expect(authorize()!.disabled).toBe(true);
    expect(toggle().disabled).toBe(true);
    await act(() => { authorize()!.click(); toggle().click(); });
    expect(requestScreenshotPermission).toHaveBeenCalledOnce();
    expect(setScreenshotShortcutEnabled).not.toHaveBeenCalled();
    await act(() => finish({ ...initialStatus, screenRecordingGranted: true }));
    expect(authorize()).toBeUndefined();
    expect(toggle().disabled).toBe(false);
  });

  it.each([
    { ...initialStatus, supported: false },
    { ...initialStatus, screenRecordingGranted: true },
  ])("不支持截图或已授权时不显示授权按钮：%j", async (status) => {
    vi.mocked(getScreenshotStatus).mockResolvedValue(status);
    await render();
    expect(authorize()).toBeUndefined();
    expect(toggle().disabled).toBe(!status.supported);
    expect(requestScreenshotPermission).not.toHaveBeenCalled();
  });
});
