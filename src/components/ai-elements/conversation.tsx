import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const BOTTOM_THRESHOLD = 24;

export function Conversation({ children, className, scrollToBottomTrigger = 0 }: { children: ReactNode; className?: string; scrollToBottomTrigger?: number }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const isFollowingLatestRef = useRef(true);
  const [canScrollToBottom, setCanScrollToBottom] = useState(false);

  const updateScrollPosition = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const isAtBottom = distanceFromBottom <= BOTTOM_THRESHOLD;
    isFollowingLatestRef.current = isAtBottom;
    setCanScrollToBottom(!isAtBottom);
  }, []);

  const followLatestContent = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || !isFollowingLatestRef.current) return;
    viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    setCanScrollToBottom(false);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    updateScrollPosition();
    viewport.addEventListener("scroll", updateScrollPosition, { passive: true });

    const resizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => {
      if (isFollowingLatestRef.current) followLatestContent();
      else updateScrollPosition();
    });
    resizeObserver?.observe(viewport);
    if (viewport.firstElementChild instanceof HTMLElement) resizeObserver?.observe(viewport.firstElementChild);

    return () => {
      viewport.removeEventListener("scroll", updateScrollPosition);
      resizeObserver?.disconnect();
    };
  }, [followLatestContent, updateScrollPosition]);

  useEffect(() => {
    followLatestContent();
  }, [children, followLatestContent]);

  useEffect(() => {
    isFollowingLatestRef.current = true;
    followLatestContent();
  }, [followLatestContent, scrollToBottomTrigger]);

  const scrollToBottom = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    isFollowingLatestRef.current = true;
    setCanScrollToBottom(false);
    viewport.scrollTo({ top: Math.max(0, viewport.scrollHeight - viewport.clientHeight), behavior: "smooth" });
  };

  return <div className={cn("relative h-full", className)}>
    <ScrollArea viewportRef={viewportRef} className="conversation-scroll-area h-full">{children}</ScrollArea>
    {canScrollToBottom && <Button type="button" variant="ghost" size="icon-sm" className="absolute bottom-4 left-1/2 z-30 size-8 -translate-x-1/2 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-popover)] animate-in fade-in hover:bg-[var(--bg-hover)]" aria-label="滚动到底部" title="滚动到底部" onClick={scrollToBottom}><ArrowDown className="size-4" /></Button>}
  </div>;
}
