import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BOTTOM_THRESHOLD = 24;

export function Conversation({ children, className, scrollToBottomTrigger = 0 }: { children: ReactNode; className?: string; scrollToBottomTrigger?: number }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScrollingToBottomRef = useRef(false);
  const [canScrollToBottom, setCanScrollToBottom] = useState(false);

  const updateScrollPosition = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const maxScrollTop = Math.max(viewport.scrollHeight - viewport.clientHeight, 0);
    const distanceFromBottom = Math.max(0, -viewport.scrollTop);

    if (maxScrollTop <= BOTTOM_THRESHOLD) {
      isProgrammaticScrollingToBottomRef.current = false;
      setCanScrollToBottom(false);
      return;
    }

    if (isProgrammaticScrollingToBottomRef.current) {
      setCanScrollToBottom(false);
      if (distanceFromBottom <= BOTTOM_THRESHOLD) isProgrammaticScrollingToBottomRef.current = false;
      return;
    }

    setCanScrollToBottom(distanceFromBottom > BOTTOM_THRESHOLD);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    updateScrollPosition();
    viewport.addEventListener("scroll", updateScrollPosition, { passive: true });

    return () => {
      viewport.removeEventListener("scroll", updateScrollPosition);
    };
  }, [updateScrollPosition]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    isProgrammaticScrollingToBottomRef.current = false;
    viewport.scrollTop = 0;
    setCanScrollToBottom(false);
  }, [scrollToBottomTrigger]);

  const scrollToBottom = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    isProgrammaticScrollingToBottomRef.current = true;
    setCanScrollToBottom(false);
    viewport.scrollTo({ top: 0, behavior: "smooth" });
  };

  return <div className={cn("relative h-full", className)}>
    <div ref={viewportRef} data-slot="conversation-scroll-viewport" className="conversation-scroll-area flex h-full min-h-0 w-full flex-col-reverse overflow-y-auto">
      <div data-slot="conversation-bottom-placeholder" className="min-h-4 flex-1 shrink-0" />
      <div data-slot="conversation-scroll-content" className="w-full shrink-0">{children}</div>
    </div>
    {canScrollToBottom && <Button type="button" variant="ghost" size="icon-sm" className="absolute bottom-4 left-1/2 z-30 size-8 -translate-x-1/2 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-popover)] animate-in fade-in hover:bg-[var(--bg-hover)]" aria-label="滚动到底部" title="滚动到底部" onClick={scrollToBottom}><ArrowDown className="size-4" /></Button>}
  </div>;
}
