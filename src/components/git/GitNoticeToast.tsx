import { useEffect } from "react";
import { Check, X } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";

export function GitNoticeToast({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timeoutId = window.setTimeout(onDismiss, 2400);
    return () => window.clearTimeout(timeoutId);
  }, [message, onDismiss]);

  if (!message) return null;
  return <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-50 flex max-w-[320px] items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface-raised)] px-3 py-2 text-[var(--font-size-11)] text-[var(--text-primary)] shadow-[var(--shadow-popover)] animate-in fade-in slide-in-from-bottom-1">
    <Check className="size-3.5 shrink-0 text-[var(--success)]" />
    <span className="min-w-0 flex-1 text-pretty">{message}</span>
    <Button type="button" variant="ghost" size="icon-xs" onClick={onDismiss} aria-label="关闭 Git 提示"><X /></Button>
  </div>;
}
