import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Check, CircleDot, LoaderCircle, TriangleAlert } from "@/components/ui/icons";
import type { PiGoalState } from "@/lib/pi-runtime";

/* 目标模式状态条：挂在输入框上方的队列区域，随目标状态常驻展示；
   目标完成后立即隐藏，完成瞬间用 toast 反馈。 */
export function GoalStatus({ goal }: { goal: PiGoalState | null }) {
  const previousStatusRef = useRef<PiGoalState["status"] | null>(goal?.status ?? null);
  useEffect(() => {
    const status = goal?.status ?? null;
    /* 仅在运行中转为完成时提示，历史会话加载的已完成目标不打扰。 */
    if (previousStatusRef.current !== "complete" && status === "complete") {
      toast.success("目标已完成");
    }
    previousStatusRef.current = status;
  }, [goal?.status]);

  if (!goal || goal.status === "complete") return null;
  const { icon, label } = goalStatusPresentation(goal.status);
  return <div data-slot="goal-status" role="status" aria-label={`目标模式：${goal.objective}`} className="mb-2 flex w-fit max-w-full items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5">
    <span className="flex shrink-0 items-center gap-1.5 text-[var(--font-size-10-5)] font-medium text-[var(--text-tertiary)]">{icon}<span>目标模式</span></span>
    <span className="min-w-0 flex-1 truncate text-[var(--font-size-11-5)] text-[var(--text-primary)]" title={goal.objective}>{goal.objective}</span>
    <span className="shrink-0 text-[var(--font-size-10)] text-[var(--text-tertiary)]">{label}</span>
  </div>;
}

function goalStatusPresentation(status: PiGoalState["status"]) {
  if (status === "active") return { icon: <LoaderCircle size={12} className="animate-spin text-[var(--accent)]" />, label: "进行中" };
  if (status === "paused") return { icon: <CircleDot size={12} className="text-[var(--text-tertiary)]" />, label: "已暂停" };
  if (status === "complete") return { icon: <Check size={12} className="text-[var(--success)]" />, label: "已完成" };
  return { icon: <TriangleAlert size={12} className="text-[var(--warning)]" />, label: "已达预算" };
}
