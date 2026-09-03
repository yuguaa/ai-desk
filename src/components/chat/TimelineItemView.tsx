import { memo } from "react";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { MessageCopyButton } from "@/components/chat/MessageCopyButton";
import { Reasoning } from "@/components/ai-elements/reasoning";
import { Tool } from "@/components/ai-elements/tool";
import type { TimelineItem } from "@/lib/pi-session";

export const TimelineItemView = memo(function TimelineItemView({ item }: { item: TimelineItem }) {
  if (item.type === "user") {
    return <Message from="user" className="py-4 pt-6"><div className="flex min-w-0 max-w-[80%] flex-col items-end gap-1.5"><MessageContent className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] px-3 py-2 text-[var(--font-size-13)] leading-5 text-[var(--text-primary)]"><MessageResponse>{item.text}</MessageResponse></MessageContent><div data-slot="user-message-meta" className="flex items-center justify-end gap-1.5"><MessageCopyButton text={item.text} /><div className="font-mono text-[var(--font-size-9-5)] text-[var(--text-tertiary)]">{item.time}</div></div></div></Message>;
  }
  if (item.type === "reasoning") return <Reasoning content={item.text} status={item.status} />;
  if (item.type === "tool") return <Tool name={item.name} command={item.command} output={item.output} status={item.status} />;
  return <Message from="assistant" className="py-4"><MessageContent className="mx-auto w-full max-w-none text-[var(--font-size-13)] leading-[1.65] text-[var(--text-primary)]"><MessageResponse isAnimating={item.streaming}>{item.text}</MessageResponse></MessageContent></Message>;
});
