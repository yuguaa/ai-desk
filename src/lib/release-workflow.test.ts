import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tauriConfig = JSON.parse(readFileSync(
  new URL("../../src-tauri/tauri.conf.json", import.meta.url),
  "utf8",
)) as { bundle?: { macOS?: { entitlements?: string } } };
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

  it("Linux 只打包稳定的 DEB 和 RPM 产物", () => {
    expect(workflow).toContain('args: "--bundles deb,rpm"');
    expect(workflow).toContain("args: ${{ matrix.args }}");
  });

  it("macOS 为签名后的 Bun Pi sidecar 开启 JIT 权限", () => {
    expect(tauriConfig.bundle?.macOS?.entitlements).toBe("Entitlements.plist");

    const entitlements = readFileSync(
      new URL("../../src-tauri/Entitlements.plist", import.meta.url),
      "utf8",
    );
    expect(entitlements).toMatch(
      /<key>com\.apple\.security\.cs\.allow-jit<\/key>\s*<true\/>/,
    );
  });

  it("macOS 发布任务验证最终签名后的 Pi sidecar", () => {
    const packageJob = workflow.slice(workflow.indexOf("  package:"));
    const bundleIndex = packageJob.indexOf("tauri-apps/tauri-action@");
    const smokeTestIndex = packageJob.indexOf("验证签名后的 Pi sidecar");

    expect(bundleIndex).toBeGreaterThan(-1);
    expect(smokeTestIndex).toBeGreaterThan(bundleIndex);
    expect(packageJob).toContain("Contents/MacOS/pi\" --version");
  });
});
