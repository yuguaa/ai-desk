// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectTrustPanel } from "@/components/workspace/ProjectTrustPanel";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe("ProjectTrustPanel", () => {
  it("展示 trust 状态并允许切换", async () => {
    const onTrustedChange = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ProjectTrustPanel projectName="ai-desk" projectPath="/code/ai-desk" trusted={false} onTrustedChange={onTrustedChange} />);
    });

    expect(container.textContent).toContain("信任此项目");
    expect(container.textContent).toContain("不会限制 Agent 的文件访问或工具权限");

    const trustButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "信任项目");
    act(() => trustButton?.click());

    expect(onTrustedChange).toHaveBeenCalledWith(true);
  });

  it("已信任时不再展示状态提示", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ProjectTrustPanel projectName="ai-desk" projectPath="/code/ai-desk" trusted />);
    });

    expect(container.innerHTML).toBe("");
  });
});
