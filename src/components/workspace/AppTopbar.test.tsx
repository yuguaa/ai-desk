import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pi-bridge", () => ({ isMacTauriRuntime: () => true }));

import { AppTopbar } from "@/components/workspace/AppTopbar";

describe("AppTopbar", () => {
  it("为 macOS Tauri 渲染沉浸式拖拽标题栏", () => {
    const html = renderToStaticMarkup(<AppTopbar />);

    expect(html).toContain('data-tauri-drag-region="deep"');
    expect(html).toContain('data-immersive="true"');
    expect(html).toContain("data-[immersive=true]:h-[52px]");
    expect(html).toContain("data-[immersive=true]:pl-[76px]");
    expect(html).toContain("bg-[var(--bg-titlebar)]");
    expect(html).toContain("AI DESK");
    expect(html).not.toContain("<img");
  });
});
