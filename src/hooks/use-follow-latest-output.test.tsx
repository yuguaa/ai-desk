// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFollowLatestOutput } from "@/hooks/use-follow-latest-output";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function Output({ content, enabled = true, reverse = false }: { content: string; enabled?: boolean; reverse?: boolean }) {
  const { containerRef, updateFollowState } = useFollowLatestOutput<HTMLDivElement>(content, enabled, reverse);
  return <div ref={containerRef} onScroll={(event) => updateFollowState(event.currentTarget)}>{content}</div>;
}

function mount(reverse: boolean) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Output content="0" reverse={reverse} />));
  const viewport = container.firstElementChild!;
  let top = reverse ? -120 : 500;
  const readHeight = vi.fn(() => 600);
  const readClientHeight = vi.fn(() => 100);
  const readTop = vi.fn(() => top);
  const writeTop = vi.fn((value: number) => { top = value; });
  Object.defineProperties(viewport, {
    scrollHeight: { configurable: true, get: readHeight },
    clientHeight: { configurable: true, get: readClientHeight },
    scrollTop: { configurable: true, get: readTop, set: writeTop },
  });
  return { viewport, readHeight, readClientHeight, readTop, writeTop };
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe("useFollowLatestOutput", () => {
  it("反向布局的增量更新及滚动事件均不读写布局属性", () => {
    const { viewport, readHeight, readClientHeight, readTop, writeTop } = mount(true);
    for (let token = 1; token <= 20; token += 1) {
      act(() => {
        root?.render(<Output content={String(token)} reverse />);
        viewport.dispatchEvent(new Event("scroll"));
      });
    }
    expect(viewport.textContent).toBe("20");
    for (const spy of [readHeight, readClientHeight, readTop, writeTop]) expect(spy).not.toHaveBeenCalled();
  });

  it("正向布局离开底部后暂停跟随，返回阈值内后恢复", () => {
    const { viewport, readHeight, writeTop } = mount(false);
    act(() => root?.render(<Output content="1" />));
    expect(writeTop).toHaveBeenLastCalledWith(600);
    writeTop(200);
    act(() => viewport.dispatchEvent(new Event("scroll")));
    vi.clearAllMocks();
    act(() => root?.render(<Output content="2" />));
    expect(readHeight).not.toHaveBeenCalled();
    expect(writeTop).not.toHaveBeenCalled();
    writeTop(476);
    act(() => viewport.dispatchEvent(new Event("scroll")));
    act(() => root?.render(<Output content="3" />));
    expect(writeTop).toHaveBeenLastCalledWith(600);
  });

  it("禁用时不读取高度或写入滚动位置，重新启用后恢复跟随", () => {
    const { readHeight, writeTop } = mount(false);
    act(() => root?.render(<Output content="1" enabled={false} />));
    expect(readHeight).not.toHaveBeenCalled();
    expect(writeTop).not.toHaveBeenCalled();
    act(() => root?.render(<Output content="2" />));
    expect(writeTop).toHaveBeenLastCalledWith(600);
  });
});
