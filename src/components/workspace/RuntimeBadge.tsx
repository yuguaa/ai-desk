import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function RuntimeBadge({ isTauri, compact = false }: { isTauri: boolean; compact?: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 rounded-[var(--radius-xs)] border-[var(--border-default)] bg-[var(--control-bg)] font-mono text-[var(--font-size-9-5)] font-normal",
        isTauri ? "text-[var(--success)]" : "text-[var(--warning)]",
        compact && "px-1.5 py-0.5",
      )}
    >
      <span className={cn("size-1.5 rounded-full", isTauri ? "bg-[var(--success)]" : "bg-[var(--warning)]")} />
      {isTauri ? "TAURI" : "PREVIEW"}
    </Badge>
  );
}
