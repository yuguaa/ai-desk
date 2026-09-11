// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GoalStatus } from "@/components/chat/GoalStatus";

describe("GoalStatus", () => {
  it.each([
    { status: "active", label: "进行中" },
    { status: "paused", label: "已暂停" },
    { status: "complete", label: "已完成" },
    { status: "budget_limited", label: "已达预算" },
  ] as const)("按目标状态展示对应文案：$status", ({ status, label }) => {
    const html = renderToStaticMarkup(<GoalStatus goal={{ objective: "修复滚动问题", status }} />);
    expect(html).toContain("修复滚动问题");
    expect(html).toContain(label);
    expect(html).toContain("目标模式");
  });

  it("没有目标时不渲染", () => {
    expect(renderToStaticMarkup(<GoalStatus goal={null} />)).toBe("");
  });
});
