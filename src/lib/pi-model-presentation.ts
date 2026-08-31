import type { PiContextUsage, PiModel } from "@/lib/pi-runtime";

const THINKING_LEVELS: Record<string, { label: string; description: string }> = {
  off: { label: "即时", description: "不额外推理，最快响应" },
  minimal: { label: "最少", description: "轻量推理，优先速度" },
  low: { label: "较低", description: "简单任务的少量推理" },
  medium: { label: "中等", description: "兼顾速度与推理深度" },
  high: { label: "高", description: "复杂任务的深入推理" },
  xhigh: { label: "极高", description: "最充分的推理，耗时更长" },
  auto: { label: "自动", description: "按任务复杂度决定推理深度" },
};

export function piModelKey(model: Pick<PiModel, "provider" | "id">) {
  return `${model.provider}/${model.id}`;
}

export function piModelName(model: Pick<PiModel, "id" | "name">) {
  return model.name || model.id;
}

export function piModelDescription(model: Pick<PiModel, "provider" | "id" | "name">) {
  return model.name ? `${model.provider} · ${model.id}` : model.provider;
}

export function piModelStatusLabel(model: Pick<PiModel, "provider" | "id" | "name">) {
  return `${model.provider}/${piModelName(model)}`;
}

export function thinkingLevelLabel(level: string | null | undefined) {
  if (!level) return "自动";
  return THINKING_LEVELS[level.toLowerCase()]?.label ?? formatLevel(level);
}

export function thinkingLevelDescription(level: string) {
  return THINKING_LEVELS[level.toLowerCase()]?.description ?? `使用 ${formatLevel(level)} 思考程度`;
}

export function contextUsageLabel(usage: PiContextUsage | null | undefined) {
  if (!usage) return "--";
  const tokens = usage.tokens === null ? "--" : formatTokenCount(usage.tokens);
  const percent = usage.percent === null ? "--" : `${Math.round(usage.percent)}%`;
  return `${tokens}/${formatTokenCount(usage.contextWindow)} · ${percent}`;
}

function formatLevel(level: string) {
  return level
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTokenCount(value: number) {
  if (value < 1_000) return String(Math.round(value));
  if (value < 1_000_000) return `${trimTrailingZero(value / 1_000)}K`;
  return `${trimTrailingZero(value / 1_000_000)}M`;
}

function trimTrailingZero(value: number) {
  return value.toFixed(1).replace(/\.0$/, "");
}
