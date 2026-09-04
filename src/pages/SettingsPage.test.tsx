import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import SettingsPage from "@/pages/SettingsPage";
import { DEFAULT_APP_SETTINGS } from "@/lib/app-settings";
import type { AppUpdateController } from "@/hooks/use-app-update";

const appUpdate: AppUpdateController = {
  currentVersion: "0.1.13",
  state: { status: "idle" },
  canCheck: true,
  checkUpdate: vi.fn(),
  downloadUpdate: vi.fn(),
  installUpdate: vi.fn(),
  restartApp: vi.fn(),
};

describe("SettingsPage", () => {
  it("renders appearance controls, mascot controls, and every mascot option", () => {
    const html = renderToStaticMarkup(<SettingsPage settings={DEFAULT_APP_SETTINGS} appUpdate={appUpdate} isTauri onBack={vi.fn()} onUpdate={vi.fn()} onReset={vi.fn()} />);

    expect(html).toContain("应用设置");
    expect(html).toContain("跟随系统");
    expect(html).toContain("深色");
    expect(html).toContain("浅色");
    expect(html).toContain("主题颜色");
    expect(html).toContain("自定义");
    expect(html).toContain("界面字体");
    expect(html).toContain("字体大小");
    expect(html).toContain("容器内边距");
    expect(html).toContain("统一圆角");
    expect(html).toContain("背景透明度");
    expect(html).toContain("显示看板娘");
    expect(html).toContain("图片源");
    expect(html).toContain("内置图库");
    expect(html).toContain("自定义 URL");
    expect(html).toContain("绯红魅影");
    expect(html).toContain("紫夜佳人");
    expect(html).toContain("沙滩丽人");
    expect(html).toContain("银发魅姬");
    expect(html).toContain("银发闲憩");
    expect(html).not.toContain("魅惑御姐");
    expect(html).not.toContain("工程师");
    expect((html.match(/data-slot="switch"/g) ?? []).length).toBe(2);
    expect((html.match(/data-slot="input-number"/g) ?? []).length).toBe(4);
    expect(html).toMatch(/aria-label="背景透明度"[^>]*min="20"[^>]*max="100"[^>]*step="1"/);
    expect(html).toMatch(/aria-label="容器内边距"[^>]*min="8"[^>]*max="20"[^>]*step="1"/);
    expect((html.match(/data-slot="select-trigger"/g) ?? []).length).toBe(1);
    expect((html.match(/data-slot="toggle-group"/g) ?? []).length).toBe(4);
    expect((html.match(/data-slot="toggle-group-item"/g) ?? []).length).toBe(20);
    expect(html).not.toContain("inset_0_-2px_0_var(--accent)");
    expect(html).toContain('data-slot="titlebar-drag-region"');
    expect(html).toContain('data-slot="settings-titlebar-actions"');
    expect(html).toContain("max-w-[760px]");
    expect(html).toContain("min-[460px]:inline-flex");
    expect(html).toMatch(/<header(?![^>]*data-tauri-drag-region)/);
    expect(html).toContain('aria-label="返回工作区"');
  });

  it("renders a validated custom image source without the built-in grid", () => {
    const settings = { ...DEFAULT_APP_SETTINGS, mascotSource: "customUrl" as const, mascotImageUrls: ["https://example.com/mascot.png", "https://example.com/second.png"], mascotImageUrlIndex: 0 };
    const html = renderToStaticMarkup(<SettingsPage settings={settings} appUpdate={appUpdate} isTauri onBack={vi.fn()} onUpdate={vi.fn()} onReset={vi.fn()} />);

    expect(html).toContain('aria-label="看板娘图片地址 1"');
    expect(html).toContain('aria-label="看板娘图片地址 2"');
    expect(html).toContain('aria-label="添加看板娘图片链接"');
    expect(html).toContain('value="https://example.com/mascot.png"');
    expect(html).toContain('value="https://example.com/second.png"');
    expect(html).toContain('src="https://example.com/mascot.png"');
    expect(html).toContain("aspect-video");
    expect(html).toContain("min-[540px]:grid-cols-[184px_minmax(0,1fr)]");
    expect(html).not.toContain("绯红魅影");
    expect((html.match(/data-slot="toggle-group"/g) ?? []).length).toBe(3);
    expect((html.match(/data-slot="toggle-group-item"/g) ?? []).length).toBe(14);
  });
});
