import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../../.github/workflows/release.yml", import.meta.url),
  "utf8",
);

describe("release workflow", () => {
  it("使用系统 Node.js 安装 pnpm，兼容 Intel macOS runner", () => {
    expect(workflow).not.toContain("pnpm/setup@");
    expect(workflow.match(/actions\/setup-node@/g)).toHaveLength(2);
    expect(workflow.match(/npm install --global pnpm@11\.22\.0/g)).toHaveLength(2);
  });

  it("在 Rust 检查前构建当前平台的 Pi sidecar", () => {
    const verifyJob = workflow.slice(
      workflow.indexOf("  verify:"),
      workflow.indexOf("  package:"),
    );
    const setupBunIndex = verifyJob.indexOf("oven-sh/setup-bun");
    const buildSidecarIndex = verifyJob.indexOf("pnpm build:pi-sidecar");
    const cargoTestIndex = verifyJob.indexOf("cargo test --locked");

    expect(setupBunIndex).toBeGreaterThan(-1);
    expect(buildSidecarIndex).toBeGreaterThan(setupBunIndex);
    expect(cargoTestIndex).toBeGreaterThan(buildSidecarIndex);
  });
});
