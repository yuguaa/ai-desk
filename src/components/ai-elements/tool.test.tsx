// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Tool } from "@/components/ai-elements/tool";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe("Tool", () => {
  it("将 Bash 命令展示在展开内容的代码块中", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Tool name="bash" command="pnpm test" output={"\u001b[32m全部通过\u001b[0m"} status="completed" />);
      await Promise.resolve();
    });

    const trigger = container.querySelector('[data-slot="collapsible-trigger"]');
    expect(trigger?.textContent).not.toContain("pnpm test");

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const terminal = container.querySelector('[data-slot="terminal"]');
    expect(terminal?.querySelector('[data-slot="terminal-title"]')?.textContent).toContain("bash");
    expect(terminal?.querySelector('[data-slot="terminal-content"]')?.textContent).toBe("$ pnpm test\n全部通过");
    expect(terminal?.querySelector(".ansi-green-fg")?.textContent).toBe("全部通过");
    expect(terminal?.querySelector('button[aria-label="复制终端内容"]')).not.toBeNull();
  });

  it("非 Bash 命令使用 Shell 标识", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Tool name="exec" command="pwd" output="/demo" status="running" />);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-slot="terminal-title"]')?.textContent).toContain("shell");
  });

  it("通用工具参数不伪装成 Shell 命令", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Tool name="read" command={'{"path":"src/App.tsx"}'} output="文件内容" status="running" />);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-slot="terminal-title"]')?.textContent).toContain("read");
    expect(container.querySelector('[data-slot="terminal-content"]')?.textContent).toBe('{"path":"src/App.tsx"}\n文件内容');
  });
});
