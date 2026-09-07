// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import Ansi from "ansi-to-react";
import { Tool } from "@/components/ai-elements/tool";

vi.mock("ansi-to-react", (importOriginal) => importOriginal<typeof import("ansi-to-react")>().then((module) => {
  const component = module.default as typeof Ansi & { default?: typeof Ansi };
  return { ...module, default: vi.fn(component.default ?? component) };
}));

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.clearAllMocks();
});

describe("工具流式 ANSI 解析", () => {
  it("只更新状态不重复解析，新增输出仍解析并可复制", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const output = "\u001b[32m第一段\u001b[0m";
    await act(() => root?.render(<Tool name="bash" command="pwd" output={output} status="running" />));
    expect(container.querySelector(".ansi-green-fg")?.textContent).toBe("第一段");
    vi.mocked(Ansi).mockClear();

    await act(() => root?.render(<Tool name="bash" command="pwd" output={output} status="completed" />));
    expect(container.textContent).toContain("完成");
    expect(container.querySelector('[data-slot="terminal-content"] [aria-hidden="true"]')).toBeNull();
    expect(Ansi).not.toHaveBeenCalled();

    const nextOutput = `${output}\n第二段`;
    await act(() => root?.render(<Tool name="bash" command="ls" output={nextOutput} status="running" />));
    expect(Ansi).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-slot="terminal-content"]')?.textContent).toBe("$ ls\n第一段\n第二段");
    expect(container.querySelector('[data-slot="terminal-content"] [aria-hidden="true"]')).not.toBeNull();
    await act(() => container?.querySelector<HTMLButtonElement>('button[aria-label="复制终端内容"]')?.click());
    expect(writeText).toHaveBeenCalledWith(`$ ls\n${nextOutput}`);
  });
});
