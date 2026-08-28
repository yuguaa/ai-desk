import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const defaultCapability = JSON.parse(
  readFileSync(new URL("../../src-tauri/capabilities/default.json", import.meta.url), "utf8"),
) as { permissions: string[] };

describe("Tauri window capabilities", () => {
  it("允许自定义标题栏启动窗口拖拽", () => {
    expect(defaultCapability.permissions).toContain("core:window:allow-start-dragging");
  });
});
