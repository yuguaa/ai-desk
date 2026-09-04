import { ArrowRight, ChevronDown, FileText, RotateCcw, Undo2 } from "@/components/ui/icons";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { ConversationTurnChanges } from "@/lib/conversation-changes";

const COMPLETED_BANNER_CLASS = "my-2 overflow-hidden rounded-[var(--radius-md)] bg-[var(--bg-surface)] px-3 shadow-[inset_0_0_0_1px_var(--border-subtle)]";

export function ConversationChangesBar({ change, onViewChanges, onRefresh, onPreviewChange, onRevert }: { change: ConversationTurnChanges; onViewChanges: () => void; onRefresh: () => void; onPreviewChange: (path: string) => void; onRevert: (path?: string) => Promise<boolean> | void }) {
  const [open, setOpen] = useState(false);
  const [reverting, setReverting] = useState<string | null>(null);
  if (change.phase !== "completed") return null;
  const status = change.status;
  const additions = status?.additions ?? 0;
  const deletions = status?.deletions ?? 0;
  const fileCount = status?.files.length ?? 0;

  const handleRevert = (path?: string) => {
    const target = path ?? "all";
    setReverting(target);
    Promise.resolve(onRevert(path)).finally(() => setReverting(null));
  };

  if (!fileCount) {
    return <div data-slot="conversation-changes" data-phase="completed" data-layout="banner" className={`${COMPLETED_BANNER_CLASS} flex min-h-9 items-center gap-2 text-[var(--font-size-11)] text-[var(--text-secondary)]`}><FileText className="size-3.5 text-[var(--text-tertiary)]" /><strong className="font-medium text-[var(--text-secondary)]">本次执行未修改文件</strong></div>;
  }
  return <Collapsible data-slot="conversation-changes" data-phase="completed" data-layout="banner" open={open} onOpenChange={setOpen} className={COMPLETED_BANNER_CLASS}><div className="flex min-h-9 items-center gap-2 text-[var(--font-size-11)] text-[var(--text-secondary)]"><CollapsibleTrigger asChild><Button type="button" variant="ghost" className="flex min-w-0 flex-1 justify-start gap-1.5 rounded-none px-0 text-left text-[var(--font-size-11)] font-normal hover:bg-transparent"><FileText className="size-3.5 shrink-0 text-[var(--accent)]" /><span className="truncate"><strong className="font-medium text-[var(--text-primary)]">本次执行修改了 {fileCount} 个文件</strong><span className="ml-2 font-mono text-[var(--font-size-10)] tabular-nums text-[var(--text-tertiary)]">+{additions} / -{deletions}</span></span><ChevronDown className={`ml-auto size-3.5 shrink-0 text-[var(--text-tertiary)] transition-transform ${open ? "rotate-180" : ""}`} /></Button></CollapsibleTrigger><Button type="button" variant="ghost" size="xs" className="h-6 gap-1 px-1.5 text-[var(--font-size-10-5)]" onClick={onViewChanges}>查看 Git<ArrowRight className="size-3" /></Button><Button type="button" variant="ghost" size="xs" className="h-6 gap-1 px-1.5 text-[var(--font-size-10-5)]" onClick={() => handleRevert()} disabled={reverting !== null}><Undo2 className="size-3" />撤销全部</Button><Button type="button" variant="ghost" size="icon-xs" onClick={onRefresh} aria-label="刷新本次执行变更"><RotateCcw /></Button></div><CollapsibleContent><ul className="border-t border-[var(--border-subtle)] py-1">{(status?.files ?? []).map((file) => <li key={`${file.code}-${file.path}`} className="flex items-center gap-1"><Button type="button" variant="ghost" className="flex h-7 min-w-0 flex-1 justify-start gap-2 rounded-none px-0 text-left text-[var(--font-size-11)] font-normal" onClick={() => onPreviewChange(file.path)}><span className={`w-4 text-center font-mono text-[var(--font-size-10)] font-semibold ${file.code.includes("D") ? "text-[var(--error)]" : file.code.includes("M") ? "text-[var(--warning)]" : "text-[var(--success)]"}`}>{file.code.trim() || "·"}</span><span className="min-w-0 flex-1 truncate">{file.path}</span><ArrowRight className="size-3 text-[var(--text-tertiary)]" /></Button><Button type="button" variant="ghost" size="icon-xs" onClick={() => handleRevert(file.path)} disabled={reverting !== null} aria-label={`撤销 ${file.path}`}><Undo2 className="size-3" /></Button></li>)}</ul></CollapsibleContent></Collapsible>;
}
