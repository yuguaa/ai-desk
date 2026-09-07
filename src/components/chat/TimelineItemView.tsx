import { memo } from "react";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { MessageCopyButton } from "@/components/chat/MessageCopyButton";
import { ImageAttachments } from "@/components/chat/ImageAttachments";
import { Reasoning } from "@/components/ai-elements/reasoning";
import { Tool } from "@/components/ai-elements/tool";
import type { TimelineItem } from "@/lib/pi-session";

export const TimelineItemView = memo(function TimelineItemView({ item }: { item: TimelineItem }) {
  /* 流式同步会重建消息块，按平铺字段比较，避免未变化的正文、思考和工具重复渲染。 */
  return <TimelineItemContent {...item} />;
});

const TimelineItemContent = memo(function TimelineItemContent(item: TimelineItem) {
  if (item.type === "user") {
    return (
      <Message from="user" className="py-4 pt-6">
        <div className="flex min-w-0 max-w-[80%] flex-col items-end gap-1.5">
          {item.images && item.images.length > 0 && <ImageAttachments images={item.images} />}
          {item.text.trim() && <MessageContent className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] px-3 py-2 text-[var(--font-size-13)] leading-5 text-[var(--text-primary)]"><MessageResponse>{item.text}</MessageResponse></MessageContent>}
          <div data-slot="user-message-meta" className="flex items-center justify-end gap-1.5">
            {item.text.trim() && <MessageCopyButton text={item.text} />}
            <div className="font-mono text-[var(--font-size-9-5)] text-[var(--text-tertiary)]">{item.time}</div>
          </div>
        </div>
      </Message>
    );
  }
  if (item.type === "reasoning") return <Reasoning content={item.text} status={item.status} />;
  if (item.type === "tool") return <Tool name={item.name} command={item.command} output={item.output} status={item.status} />;
  return <Message from="assistant" className="py-4"><MessageContent className="mx-auto w-full max-w-none text-[var(--font-size-13)] leading-[1.65] text-[var(--text-primary)]"><MessageResponse isAnimating={item.streaming}>{item.text}</MessageResponse></MessageContent></Message>;
});
