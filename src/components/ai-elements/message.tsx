import type { ComponentType, ReactNode, SVGProps } from "react";
import { Streamdown, type IconMap } from "streamdown";
import { Check, Copy, Download, ExternalLink, LoaderCircle, Maximize2, RefreshCw, X, ZoomIn, ZoomOut, type AnimateIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

type StreamdownIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

const streamdownIcons: IconMap = {
  CheckIcon: adaptIcon(Check),
  CopyIcon: adaptIcon(Copy),
  DownloadIcon: adaptIcon(Download),
  ExternalLinkIcon: adaptIcon(ExternalLink),
  Loader2Icon: adaptIcon(LoaderCircle),
  Maximize2Icon: adaptIcon(Maximize2),
  RotateCcwIcon: adaptIcon(RefreshCw),
  XIcon: adaptIcon(X),
  ZoomInIcon: adaptIcon(ZoomIn),
  ZoomOutIcon: adaptIcon(ZoomOut),
};

export function Message({
  from,
  children,
  className,
}: {
  from: "user" | "assistant" | "system";
  children: ReactNode;
  className?: string;
}) {
  return (
    <article className={cn("flex w-full", from === "user" ? "justify-end" : "justify-start", className)}>
      {children}
    </article>
  );
}

export function MessageContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("max-w-[78ch] text-[var(--font-size-15)] leading-7", className)}>{children}</div>;
}

export function MessageResponse({ children, isAnimating = false }: { children: string; isAnimating?: boolean }) {
  return (
    <Streamdown
      mode={isAnimating ? "streaming" : "static"}
      parseIncompleteMarkdown={isAnimating}
      isAnimating={isAnimating}
      animated={false}
      caret={isAnimating ? "block" : undefined}
      icons={streamdownIcons}
      controls={{
        code: { copy: true, download: false },
        table: { copy: true, download: false, fullscreen: false },
        mermaid: false,
        image: false,
      }}
      className={cn("streamdown-message text-pretty", isAnimating && "streamdown-message-streaming")}
    >
      {children}
    </Streamdown>
  );
}

function adaptIcon(Icon: AnimateIcon): StreamdownIcon {
  return function StreamdownIconAdapter({ size, className }: SVGProps<SVGSVGElement> & { size?: number }) {
    return <Icon size={size} className={className} />;
  };
}
