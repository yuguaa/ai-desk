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

  it.each([
    [true, "data-[immersive=true]:h-[52px]"],
    [false, null],
  ])("macOS 使用 52px 沉浸式标题栏，其他平台使用 40px（macOS：%s）", (mac, immersiveClass) => {
    windowState.mac = mac;
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<AppTopbar />);
    const header = container.querySelector("header");
    expect(header?.classList.contains("h-10")).toBe(true);
    if (immersiveClass) {
      expect(header?.className).toContain(immersiveClass);
      expect(header?.className).toContain("data-[immersive=true]:pl-[76px]");
      expect(header?.getAttribute("data-immersive")).toBe("true");
    } else {
      expect(header?.getAttribute("data-immersive")).toBe("false");
    }
    expect(header?.hasAttribute("data-fullscreen")).toBe(false);
    expect(header?.textContent).toContain("AI DESK");
  });
});
