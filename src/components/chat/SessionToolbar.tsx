import { Cpu } from "@/components/ui/icons";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PiModel } from "@/lib/pi-runtime";
import { piModelStatusLabel, thinkingLevelLabel } from "@/lib/pi-model-presentation";

export function SessionToolbar({ selectedModel, thinkingLevel, runtimeAvailable, isBusy }: { selectedModel: PiModel | null; thinkingLevel: string | null; runtimeAvailable: boolean; isBusy: boolean }) {
  const [statsOpen, setStatsOpen] = useState(false);
  const modelLabel = selectedModel ? piModelStatusLabel(selectedModel) : runtimeAvailable ? "正在读取模型" : "桌面预览";
  return <>
    <div className="flex h-8 shrink-0 items-center border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--font-size-10-5)] text-[var(--text-secondary)]">
      <span className="flex min-w-0 items-center gap-1.5 truncate px-3 text-[var(--text-tertiary)]"><Cpu className="size-3.5" /><span className="truncate">{modelLabel} · {thinkingLevelLabel(thinkingLevel)}</span></span>
      <Button type="button" variant="ghost" className={cn("ml-auto flex h-full items-center gap-1.5 rounded-none border-l border-[var(--border-subtle)] px-3 font-mono text-[var(--font-size-10)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] active:scale-100", statsOpen && "bg-[var(--bg-hover)] text-[var(--text-primary)]")} onClick={() => setStatsOpen((value) => !value)} aria-expanded={statsOpen}><span className={cn("size-1.5 rounded-full", isBusy ? "animate-pulse bg-[var(--accent)]" : runtimeAvailable ? "bg-[var(--success)]" : "bg-[var(--warning)]")} />{isBusy ? "Pi 运行中" : runtimeAvailable ? "就绪" : "桌面预览"}</Button>
    </div>
    {statsOpen && <div className="shrink-0 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] px-4 py-2 font-mono text-[var(--font-size-10-5)] text-[var(--text-tertiary)]"><span className="text-[var(--text-secondary)]">session</span> · local JSONL · {runtimeAvailable ? "Tauri process" : "browser projection"}</div>}
  </>;
}
