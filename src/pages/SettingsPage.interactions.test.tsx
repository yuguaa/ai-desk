// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "@/pages/SettingsPage";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "@/lib/app-settings";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

let root: Root;
let container: HTMLDivElement;
const onUpdate = vi.fn();

function SettingsHarness() {
  const [settings, setSettings] = useState<AppSettings>({ ...DEFAULT_APP_SETTINGS, accentColor: "custom" });
  return <SettingsPage settings={settings} isTauri onBack={() => undefined} onReset={() => setSettings(DEFAULT_APP_SETTINGS)}
    onUpdate={(key, value) => {
      onUpdate(key, value);
      setSettings((current) => ({ ...current, [key]: value }));
    }}
    appUpdate={{ currentVersion: "0.1.16", state: { status: "idle" }, canCheck: true, checkUpdate: vi.fn(), downloadUpdate: vi.fn(), installUpdate: vi.fn(), restartApp: vi.fn() }} />;
}

beforeEach(() => {
  vi.useFakeTimers();
  onUpdate.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<SettingsHarness />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

function enterColor(value: string) {
  const input = container.querySelector<HTMLInputElement>('input[aria-label="自定义主题颜色十六进制值"]')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return input;
}

describe("SettingsPage interactions", () => {
  it("逐字输入六位颜色时不会在三位处展开并打断输入", () => {
    for (const value of ["#", "#1", "#12", "#123", "#1234", "#12345", "#123456"]) {
      expect(enterColor(value).value).toBe(value);
    }
    expect(onUpdate.mock.calls).toEqual([
      ["customAccentColor", "#112233"],
      ["customAccentColor", "#123456"],
    ]);
    expect(container.querySelector<HTMLInputElement>('input[type="color"]')?.value).toBe("#123456");
  });

  it("连续修改后保存提示从最后一次操作起显示完整的 1400 毫秒", () => {
    enterColor("#123456");
    act(() => vi.advanceTimersByTime(1000));
    enterColor("#abcdef");
    act(() => vi.advanceTimersByTime(400));
    expect(container.textContent).toContain("设置已更新");
    act(() => vi.advanceTimersByTime(999));
    expect(container.textContent).toContain("设置已更新");
    act(() => vi.advanceTimersByTime(1));
    expect(container.textContent).not.toContain("设置已更新");
  });

  it("离开设置页时清理保存提示定时器", () => {
    const baseline = vi.getTimerCount();
    enterColor("#123456");
    expect(vi.getTimerCount()).toBe(baseline + 1);
    act(() => root.render(null));
    expect(vi.getTimerCount()).toBe(0);
  });
});
