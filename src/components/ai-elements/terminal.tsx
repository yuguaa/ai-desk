"use client";

import Ansi from "ansi-to-react";
import type { ComponentProps, HTMLAttributes, UIEvent as ReactUIEvent } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy, Terminal as TerminalIcon, Trash2 } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface TerminalContextType {
  output: string;
  isStreaming: boolean;
  autoScroll: boolean;
  onClear?: () => void;
}

const TerminalContext = createContext<TerminalContextType>({
  autoScroll: true,
  isStreaming: false,
  output: "",
});

const TERMINAL_SCROLL_THRESHOLD = 24;

export type TerminalHeaderProps = HTMLAttributes<HTMLDivElement>;

export function TerminalHeader({ className, children, ...props }: TerminalHeaderProps) {
  return <div data-slot="terminal-header" className={cn("flex items-center justify-between border-b border-[var(--border-subtle)] px-2.5 py-1", className)} {...props}>{children}</div>;
}

export type TerminalTitleProps = HTMLAttributes<HTMLDivElement>;

export function TerminalTitle({ className, children, ...props }: TerminalTitleProps) {
  return <div data-slot="terminal-title" className={cn("flex items-center gap-1.5 font-mono text-[var(--font-size-9-5)] text-[var(--text-tertiary)]", className)} {...props}><TerminalIcon className="size-3" />{children ?? "shell"}</div>;
}

export type TerminalStatusProps = HTMLAttributes<HTMLDivElement>;

export function TerminalStatus({ className, children, ...props }: TerminalStatusProps) {
  const { isStreaming } = useContext(TerminalContext);
  if (!isStreaming) return null;
  return <div aria-live="polite" data-slot="terminal-status" role="status" className={cn("flex items-center gap-1.5 text-[var(--font-size-9-5)] text-[var(--text-tertiary)]", className)} {...props}>{children ?? "运行中"}</div>;
}

export type TerminalActionsProps = HTMLAttributes<HTMLDivElement>;

export function TerminalActions({ className, children, ...props }: TerminalActionsProps) {
  return <div data-slot="terminal-actions" className={cn("flex items-center gap-1", className)} {...props}>{children}</div>;
}

export type TerminalCopyButtonProps = ComponentProps<typeof Button> & {
  onCopy?: () => void;
  onError?: (error: Error) => void;
  timeout?: number;
};

export function TerminalCopyButton({ onCopy, onError, timeout = 2000, children, className, onClick, "aria-label": ariaLabel, ...props }: TerminalCopyButtonProps) {
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<number>(0);
  const { output } = useContext(TerminalContext);

  const copyToClipboard = useCallback(() => {
    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
      onError?.(new Error("Clipboard API not available"));
      return;
    }

    navigator.clipboard.writeText(output)
      .then(() => {
        setIsCopied(true);
        onCopy?.();
        timeoutRef.current = window.setTimeout(() => setIsCopied(false), timeout);
      })
      .catch((error: unknown) => onError?.(error instanceof Error ? error : new Error(String(error))));
  }, [onCopy, onError, output, timeout]);

  useEffect(() => () => window.clearTimeout(timeoutRef.current), []);

  const Icon = isCopied ? Check : Copy;
  return <Button {...props} aria-label={ariaLabel ?? (isCopied ? "已复制终端内容" : "复制终端内容")} className={cn("text-[var(--text-tertiary)] hover:text-[var(--text-primary)]", className)} onClick={(event) => { copyToClipboard(); onClick?.(event); }} size="icon-xs" variant="ghost">{children ?? <Icon className="size-3" />}</Button>;
}

export type TerminalClearButtonProps = ComponentProps<typeof Button>;

export function TerminalClearButton({ children, className, onClick, "aria-label": ariaLabel = "清空终端内容", ...props }: TerminalClearButtonProps) {
  const { onClear } = useContext(TerminalContext);
  if (!onClear) return null;
  return <Button {...props} aria-label={ariaLabel} className={cn("text-[var(--text-tertiary)] hover:text-[var(--text-primary)]", className)} onClick={(event) => { onClear(); onClick?.(event); }} size="icon-xs" variant="ghost">{children ?? <Trash2 className="size-3" />}</Button>;
}

export type TerminalContentProps = HTMLAttributes<HTMLDivElement>;

export function TerminalContent({ className, children, onScroll, ...props }: TerminalContentProps) {
  const { output, isStreaming, autoScroll } = useContext(TerminalContext);
  const containerRef = useRef<HTMLDivElement>(null);
  const isFollowingOutputRef = useRef(true);

  useEffect(() => {
    if (autoScroll && isFollowingOutputRef.current && containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [autoScroll, output]);

  const handleScroll = (event: ReactUIEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    isFollowingOutputRef.current = container.scrollHeight - container.scrollTop - container.clientHeight <= TERMINAL_SCROLL_THRESHOLD;
    onScroll?.(event);
  };

  return (
    <div data-slot="terminal-content" className={cn("max-h-64 overflow-auto px-2.5 py-2 font-mono text-[var(--font-size-11)] leading-5 text-[var(--text-secondary)]", className)} onScroll={handleScroll} ref={containerRef} {...props}>
      {children ?? <pre className="min-w-max whitespace-pre"><Ansi useClasses>{output}</Ansi>{isStreaming ? <span aria-hidden="true" className="ml-0.5 inline-block h-3.5 w-1.5 bg-[var(--text-primary)] motion-safe:animate-pulse" /> : null}</pre>}
    </div>
  );
}

export type TerminalProps = HTMLAttributes<HTMLDivElement> & {
  output: string;
  isStreaming?: boolean;
  autoScroll?: boolean;
  onClear?: () => void;
};

export function Terminal({ output, isStreaming = false, autoScroll = true, onClear, className, children, ...props }: TerminalProps) {
  const contextValue = useMemo(() => ({ autoScroll, isStreaming, onClear, output }), [autoScroll, isStreaming, onClear, output]);

  return (
    <TerminalContext.Provider value={contextValue}>
      <div data-slot="terminal" className={cn("flex flex-col overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-window)]", className)} {...props}>
        {children ?? <><TerminalHeader><TerminalTitle /><TerminalActions><TerminalStatus /><TerminalCopyButton />{onClear ? <TerminalClearButton /> : null}</TerminalActions></TerminalHeader><TerminalContent /></>}
      </div>
    </TerminalContext.Provider>
  );
}
