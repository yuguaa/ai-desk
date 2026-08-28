import { Check, ChevronDown, CircleAlert, TerminalSquare } from "@/components/ui/icons";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export function Tool({
  name,
  command,
  output,
  status,
}: {
  name: string;
  command: string;
  output: string;
  status: "completed" | "running" | "error";
}) {
  const [open, setOpen] = useState(status !== "completed");
  const Icon = status === "completed" ? Check : CircleAlert;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mx-auto my-1 w-full overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)]">
      <CollapsibleTrigger asChild><Button type="button" variant="ghost" className="flex min-h-9 w-full justify-between gap-3 rounded-none px-2.5 py-2 text-left text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] active:scale-100">
        <span className="flex min-w-0 items-center gap-2">
          <span className="grid size-[18px] shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--bg-surface)] text-[var(--text-tertiary)]"><TerminalSquare className="size-3" /></span>
          <span className="truncate text-[var(--font-size-12)] font-semibold text-[var(--text-secondary)]">{name}</span>
          <span className="truncate font-mono text-[var(--font-size-11)] text-[var(--text-tertiary)]">{command}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className={cn("flex items-center gap-1 text-[var(--font-size-10-5)] font-medium", status === "completed" ? "text-[var(--success)]" : status === "error" ? "text-[var(--error)]" : "text-[var(--warning)]")}>{status === "running" ? <Spinner className="size-3" /> : <Icon className="size-3" />}{status === "completed" ? "完成" : status === "error" ? "失败" : "运行中"}</span>
          <ChevronDown className={cn("size-3.5 text-[var(--text-tertiary)] transition-transform", open && "rotate-180")} />
        </span>
      </Button></CollapsibleTrigger>
      <CollapsibleContent><pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-[var(--border-subtle)] p-2.5 font-mono text-[var(--font-size-11)] leading-5 text-[var(--text-secondary)]">{output}</pre></CollapsibleContent>
    </Collapsible>
  );
}
