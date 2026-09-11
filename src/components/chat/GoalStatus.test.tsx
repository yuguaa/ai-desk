// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoalStatus } from "@/components/chat/GoalStatus";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
import { toast } from "sonner";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  vi.mocked(toast.success).mockClear();
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe("GoalStatus", () => {
  it.each([
    { status: "active", label: "进行中" },
    { status: "paused", label: "已暂停" },
    { status: "budget_limited", label: "已达预算" },
  ] as const)("按目标状态展示对应文案：$status", ({ status, label }) => {
    const html = renderToStaticMarkup(<GoalStatus goal={{ objective: "修复滚动问题", status }} />);
    expect(html).toContain("修复滚动问题");
    expect(html).toContain(label);
    expect(html).toContain("目标模式");
    /* 横幅宽度自适应内容，不撑满输入栏 */
    expect(html).toContain("w-fit");
  });

  it("没有目标时不渲染", () => {
    expect(renderToStaticMarkup(<GoalStatus goal={null} />)).toBe("");
  });

  it("目标完成后状态条消失", () => {
    expect(renderToStaticMarkup(<GoalStatus goal={{ objective: "修复滚动问题", status: "complete" }} />)).toBe("");
  });

  it("运行中转为完成时 toast 提示一次，历史加载的完成目标不提示", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<GoalStatus goal={{ objective: "修复滚动问题", status: "active" }} />);
    });
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled();

    await act(async () => {
      root?.render(<GoalStatus goal={{ objective: "修复滚动问题", status: "complete" }} />);
    });
    expect(vi.mocked(toast.success)).toHaveBeenCalledOnce();
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith("目标已完成");
    expect(container?.querySelector('[data-slot="goal-status"]')).toBeNull();

    /* 历史会话直接加载完成状态的目标不提示（新挂载） */
    vi.mocked(toast.success).mockClear();
    if (root) act(() => root?.unmount());
    root = createRoot(container!);
    await act(async () => {
      root?.render(<GoalStatus goal={{ objective: "历史目标", status: "complete" }} />);
    });
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
  });
});
