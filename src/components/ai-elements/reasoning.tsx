import { ChevronDown, Lightbulb } from "@/components/ui/icons";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export function Reasoning({ content, status = "completed", defaultOpen = false }: { content: string; status?: "running" | "completed"; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="my-1 w-full overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] text-[var(--font-size-12)] text-[var(--text-secondary)]">
      <CollapsibleTrigger asChild><Button type="button" variant="ghost" className="flex min-h-9 w-full justify-start gap-2 rounded-none px-2.5 py-2 text-[var(--font-size-12)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] active:scale-100"><span className="grid size-[18px] place-items-center rounded-[var(--radius-sm)] bg-[var(--accent-tint-soft)] text-[var(--accent)]"><Lightbulb className="size-3" /></span><span className="font-semibold">思考过程</span><span className={cn("ml-auto text-[var(--font-size-10-5)] font-medium", status === "running" ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]")}>{status === "running" ? "思考中" : "已完成"}</span><ChevronDown className={cn("size-3.5 text-[var(--text-tertiary)] transition-transform", open && "rotate-180")} /></Button></CollapsibleTrigger>
      <CollapsibleContent><div className="whitespace-pre-wrap border-t border-[var(--border-subtle)] p-2.5 text-[var(--font-size-12)] leading-5 text-[var(--text-secondary)]">{content}</div></CollapsibleContent>
    </Collapsible>
  );
}
