// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const windowState = vi.hoisted(() => ({
  mac: true,
}));
vi.mock("@/lib/pi-bridge", () => ({ isMacTauriRuntime: () => windowState.mac }));

import { AppTopbar } from "@/components/workspace/AppTopbar";

describe("AppTopbar", () => {
  it("为 macOS Tauri 渲染沉浸式拖拽标题栏", () => {
    windowState.mac = true;
    const html = renderToStaticMarkup(<AppTopbar />);

    expect(html).toContain('data-tauri-drag-region="deep"');
    expect(html).toContain('data-immersive="true"');
    expect(html).toContain("data-[immersive=true]:pl-[76px]");
    expect(html).toContain("bg-[var(--bg-titlebar)]");
    expect(html).toContain("AI DESK");
    expect(html).not.toContain("<img");
  });

  it.each([true, false])("所有窗口状态统一使用 32px 高度（macOS：%s）", (mac) => {
    windowState.mac = mac;
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<AppTopbar />);
    const header = container.querySelector("header");
    expect(header?.classList.contains("h-8")).toBe(true);
    expect(header?.className).not.toMatch(/:h-|h-10|52px/);
    expect(header?.hasAttribute("data-fullscreen")).toBe(false);
    expect(header?.textContent).toContain("AI DESK");
  });
});
