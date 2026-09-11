// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  packages: [] as { source: string; scope: string; kind: string }[],
  listPiPackages: vi.fn(),
  installPiPackage: vi.fn(),
  removePiPackage: vi.fn(),
}));

vi.mock("@/lib/pi-bridge", () => ({
  listPiPackages: bridge.listPiPackages,
  installPiPackage: bridge.installPiPackage,
  removePiPackage: bridge.removePiPackage,
}));

import { usePiPackages } from "@/hooks/use-pi-packages";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let hook: ReturnType<typeof usePiPackages> | undefined;

function Harness() {
  hook = usePiPackages();
  return null;
}

function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  return act(async () => {
    root?.render(<Harness />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  bridge.packages = [
    { source: "npm:a", scope: "global", kind: "npm" },
    { source: "npm:b", scope: "global", kind: "npm" },
    { source: "npm:c", scope: "project", kind: "npm" },
  ];
  bridge.listPiPackages.mockReset().mockImplementation(() => Promise.resolve(bridge.packages));
  bridge.installPiPackage.mockReset().mockImplementation(() => Promise.resolve({ ok: true, message: "" }));
  bridge.removePiPackage.mockReset().mockImplementation(() => Promise.resolve({ ok: true, message: "" }));
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  hook = undefined;
});

describe("usePiPackages", () => {
  it("加载时只保留全局插件", async () => {
    await mount();
    expect(hook!.loading).toBe(false);
    expect(hook!.packages.map((item) => item.source)).toEqual(["npm:a", "npm:b"]);
  });

  it("安装成功后刷新列表", async () => {
    await mount();
    bridge.installPiPackage.mockImplementation(() => {
      bridge.packages = [...bridge.packages, { source: "npm:new", scope: "global", kind: "npm" }];
      return Promise.resolve({ ok: true, message: "" });
    });
    let ok = false;
    await act(async () => {
      ok = await hook!.install("npm:new");
    });
    expect(ok).toBe(true);
    expect(hook!.packages.map((item) => item.source)).toContain("npm:new");
  });

  it("安装失败时记录错误并返回 false", async () => {
    await mount();
    bridge.installPiPackage.mockImplementation(() => Promise.reject(new Error("安装失败")));
    let ok = true;
    await act(async () => {
      ok = await hook!.install("npm:bad");
    });
    expect(ok).toBe(false);
    expect(hook!.error).toBe("安装失败");
  });

  it("空来源不触发安装", async () => {
    await mount();
    const ok = await hook!.install("   ");
    expect(ok).toBe(false);
    expect(bridge.installPiPackage).not.toHaveBeenCalled();
  });

  it("移除成功后从列表消失", async () => {
    await mount();
    bridge.removePiPackage.mockImplementation((source: string) => {
      bridge.packages = bridge.packages.filter((item) => item.source !== source);
      return Promise.resolve({ ok: true, message: "" });
    });
    let ok = false;
    await act(async () => {
      ok = await hook!.remove("npm:a");
    });
    expect(ok).toBe(true);
    expect(hook!.packages.map((item) => item.source)).not.toContain("npm:a");
  });
});
