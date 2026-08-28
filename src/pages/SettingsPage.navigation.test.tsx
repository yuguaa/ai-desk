// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "@/pages/SettingsPage";
import { DEFAULT_APP_SETTINGS } from "@/lib/app-settings";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

let root: Root | undefined;
let container: HTMLDivElement | undefined;

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
      root?.render(<SettingsPage settings={DEFAULT_APP_SETTINGS} isTauri onBack={onBack} onUpdate={() => undefined} onReset={() => undefined} />);
    });

    act(() => container?.querySelector<HTMLButtonElement>('button[aria-label="返回工作区"]')?.click());

    expect(onBack).toHaveBeenCalledOnce();
    expect(container.querySelector("header")?.hasAttribute("data-tauri-drag-region")).toBe(false);
    expect(container.querySelector('[data-slot="titlebar-drag-region"]')).not.toBeNull();
  });
});
