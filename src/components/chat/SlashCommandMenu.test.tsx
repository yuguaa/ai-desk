// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SlashCommandMenu } from "@/components/chat/SlashCommandMenu";
import type { SlashCommand } from "@/lib/slash-commands";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function renderMenu(commands: SlashCommand[], activeIndex = 0, onSelect = () => undefined, onHover?: (index: number) => void) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<SlashCommandMenu commands={commands} activeIndex={activeIndex} onSelect={onSelect} onHover={onHover} />));
}

const commands: SlashCommand[] = [
  { name: "new", description: "开始新会话", source: "builtin" },
  { name: "goal", description: "长跑目标", source: "extension" },
  { name: "skill:vue", description: "Vue 技能", source: "skill" },
];

describe("SlashCommandMenu", () => {
  it("展示命令名、描述与来源标签", () => {
    renderMenu(commands);
    expect(container!.textContent).toContain("/new");
    expect(container!.textContent).toContain("开始新会话");
    expect(container!.textContent).toContain("/goal");
    expect(container!.textContent).toContain("长跑目标");
    expect(container!.textContent).toContain("扩展");
    expect(container!.textContent).toContain("技能");
    expect(container!.textContent).toContain("内置");
  });

  it("点击命令项触发 onSelect，且 mousedown 阻止编辑器失焦", () => {
    const onSelect = vi.fn();
    renderMenu(commands, 0, onSelect);
    const item = Array.from(container!.querySelectorAll<HTMLButtonElement>("[role='option']")).find((button) => button.textContent?.includes("/goal"))!;
    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    act(() => item.dispatchEvent(mouseDown));
    expect(mouseDown.defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenCalledWith({ name: "goal", description: "长跑目标", source: "extension" });
  });

  it("悬停上报索引，空结果展示占位文案", () => {
    const onHover = vi.fn();
    renderMenu(commands, 0, () => undefined, onHover);
    act(() => container!.querySelectorAll("[role='option']")[2].dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    expect(onHover).toHaveBeenCalledWith(2);

    renderMenu([]);
    expect(container!.textContent).toContain("没有匹配的命令");
  });
});
