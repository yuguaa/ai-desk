import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const defaultCapability = JSON.parse(
  readFileSync(new URL("../../src-tauri/capabilities/default.json", import.meta.url), "utf8"),
) as { permissions: string[] };
const tauriConfig = JSON.parse(
  readFileSync(new URL("../../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
) as { app: { security: { csp: string } } };

describe("Tauri window capabilities", () => {
  it("允许自定义标题栏启动窗口拖拽", () => {
    expect(defaultCapability.permissions).toContain("core:window:allow-start-dragging");
  });

  it("仅允许更新检测连接 GitHub API", () => {
    const connectSource = tauriConfig.app.security.csp
      .split(";")
      .find((directive) => directive.trim().startsWith("connect-src")) ?? "";

    expect(connectSource).toContain("https://api.github.com");
    expect(connectSource).not.toMatch(/(?:^|\s)https:(?:\s|$)/);
  });
});
