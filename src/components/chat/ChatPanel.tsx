import { lazy, Suspense, useState } from "react";
import { Check, MessageSquarePlus } from "@/components/ui/icons";
import { Conversation } from "@/components/ai-elements/conversation";
import { ConversationChangesBar } from "@/components/chat/ConversationChangesBar";
import { ExtensionUiPanel } from "@/components/extension/ExtensionUiPanel";
import { getConversationTurnFingerprint, type ConversationTurnChanges } from "@/lib/conversation-changes";
import { MessageCopyButton } from "@/components/chat/MessageCopyButton";
import { Spinner } from "@/components/ui/spinner";
import type { QueuedConversationTurn } from "@/lib/conversation-queue";
import type { TimelineItem } from "@/lib/pi-session";
import type { PiContextUsage, PiExtensionResponse, PiModel } from "@/lib/pi-runtime";

const PromptInput = lazy(() => import("@/components/ai-elements/prompt-input").then((module) => ({ default: module.PromptInput })));
const TimelineItemView = lazy(() => import("@/components/chat/TimelineItemView").then((module) => ({ default: module.TimelineItemView })));

export function ChatPanel({ conversationId, timeline, draft, isBusy, queuedTurns, editingQueuedTurnId, turnChanges, models, selectedModel, thinkingLevel, thinkingLevels, contextUsage, runtimeAvailable, activeExtensionRequest, extensionNotifications, extensionStatuses, extensionWidgets, onModelChange, onThinkingChange, onReorderQueuedTurn, onRemoveQueuedTurn, onSteerQueuedTurn, onEditQueuedTurn, onDraftChange, onSend, onAbort, onViewChanges, onRefreshChanges, onPreviewChange, onRespondToExtensionUi }: { conversationId: string; timeline: TimelineItem[]; draft: string; isBusy: boolean; queuedTurns?: QueuedConversationTurn[]; editingQueuedTurnId?: string | null; turnChanges: Record<number, ConversationTurnChanges>; models: PiModel[]; selectedModel: PiModel | null; thinkingLevel: string | null; thinkingLevels: string[]; contextUsage: PiContextUsage | null; runtimeAvailable: boolean; activeExtensionRequest: unknown; extensionNotifications: unknown[]; extensionStatuses: unknown[]; extensionWidgets: unknown[]; onModelChange: (modelKey: string) => void; onThinkingChange: (level: string) => void; onReorderQueuedTurn?: (sourceId: string, targetId: string) => void; onRemoveQueuedTurn?: (turnId: string) => void; onSteerQueuedTurn?: (turnId: string) => void; onEditQueuedTurn?: (turnId: string) => void; onDraftChange: (value: string) => void; onSend: () => void; onAbort: () => void; onViewChanges: () => void; onRefreshChanges: (turnIndex: number) => void; onPreviewChange: (turnIndex: number, path: string) => void; onRespondToExtensionUi: (response: PiExtensionResponse) => void }) {
  const [scrollToBottomTrigger, setScrollToBottomTrigger] = useState(0);
  let turnIndex = -1;
  let promptFingerprint = "";
  // 当前轮次的 AI 回复文本、时间与流式状态，在轮末统一展示复制与时间
  let assistantTexts: string[] = [];
  let turnTime = "";
  let turnStreaming = false;
  const sendMessage = () => {
    if (!draft.trim()) return;
    onSend();
    setScrollToBottomTrigger((current) => current + 1);
  };

  // 当前轮（最后一条 user 消息之后）是否已有任何 AI 产出，用于区分“链接中/生成中”
  const lastUserIndex = timeline.map((item) => item.type === "user").lastIndexOf(true);
  const currentTurnHasOutput = timeline.slice(lastUserIndex + 1).length > 0;
  // 最后一个用户轮次的序号，仅该轮次在 isBusy 时抑制“已完成”，历史轮次保持可见
  const lastTurnIndex = timeline.filter((item) => item.type === "user").length - 1;

  return <div className="flex min-h-0 flex-1 flex-col bg-[var(--bg-workspace)]">
    <ExtensionUiPanel request={activeExtensionRequest} notifications={extensionNotifications} statuses={extensionStatuses} widgets={extensionWidgets} onRespond={onRespondToExtensionUi} />
    <div className="relative isolate min-h-0 flex-1 overflow-hidden">
      <Conversation key={conversationId} className="relative z-10 h-full" scrollToBottomTrigger={scrollToBottomTrigger}>
        <div className="w-full px-[var(--container-padding)] pb-[var(--container-padding-loose)] pt-[var(--container-padding)]">
          <div data-slot="conversation-content" className="conversation-column flex flex-col">
            {timeline.map((item, itemIndex) => {
              if (item.type === "user") {
                turnIndex += 1;
                promptFingerprint = getConversationTurnFingerprint(item.text);
                assistantTexts = [];
                turnTime = "";
                turnStreaming = false;
              } else if (item.type === "assistant") {
                assistantTexts.push(item.text);
                turnTime = item.time;
                if (item.streaming) turnStreaming = true;
              }
              const currentTurnIndex = turnIndex;
              const currentChange = turnChanges[currentTurnIndex];
              const matchedChange = currentChange?.promptFingerprint === promptFingerprint ? currentChange : undefined;
              const isTurnEnd = currentTurnIndex >= 0 && (itemIndex === timeline.length - 1 || timeline[itemIndex + 1]?.type === "user");
              const showTurnActions = isTurnEnd && !turnStreaming && !(isBusy && currentTurnIndex === lastTurnIndex);
              return <div key={item.id} className="contents"><Suspense fallback={<div className="min-h-8" aria-busy="true" />}><TimelineItemView item={item} /></Suspense>{showTurnActions && <div data-slot="turn-actions" className="flex items-center justify-start gap-1.5 py-1"><span className="flex items-center gap-0.5 text-[var(--font-size-10)] font-medium text-[var(--success)]"><Check size={11} />已完成</span><MessageCopyButton text={assistantTexts.join("\n\n")} /><div className="font-mono text-[var(--font-size-9-5)] text-[var(--text-tertiary)]">{turnTime}</div></div>}{isTurnEnd && matchedChange?.phase === "completed" && <ConversationChangesBar change={matchedChange} onViewChanges={onViewChanges} onRefresh={() => onRefreshChanges(currentTurnIndex)} onPreviewChange={(path) => onPreviewChange(currentTurnIndex, path)} />}</div>;
            })}
            {isBusy && <div data-slot="conversation-status" className="flex items-center gap-1.5 py-1.5 text-[var(--font-size-10-5)] leading-none text-[var(--text-tertiary)]"><Spinner className="size-3 text-[var(--accent)]" />{currentTurnHasOutput ? "生成中…" : "正在连接 Pi 进程…"}</div>}
            {!timeline.length && <div className="grid min-h-[46vh] place-items-center"><div className="max-w-[280px] text-center"><MessageSquarePlus className="mx-auto size-5 text-[var(--text-tertiary)]" /><h2 className="mt-2 text-[var(--font-size-12-5)] font-medium text-[var(--text-secondary)]">开始一个新对话</h2><p className="mt-1 text-[var(--font-size-11-5)] leading-snug text-[var(--text-tertiary)]">选择项目，然后输入要处理的本地任务。</p></div></div>}
          </div>
        </div>
      </Conversation>
    </div>
    <div data-slot="conversation-composer" className="shrink-0 bg-[var(--bg-workspace)] px-[var(--container-padding)] pb-[var(--container-padding)] pt-[var(--container-padding-tight)]"><div className="conversation-column"><Suspense fallback={<div className="h-[116px] rounded-[var(--radius-composer)] bg-[var(--composer-bg)]" aria-busy="true" />}><PromptInput value={draft} onChange={onDraftChange} onSubmit={sendMessage} onAbort={onAbort} isRunning={isBusy} queuedTurns={queuedTurns} editingQueuedTurnId={editingQueuedTurnId} models={models} selectedModel={selectedModel} thinkingLevel={thinkingLevel} thinkingLevels={thinkingLevels} contextUsage={contextUsage} runtimeAvailable={runtimeAvailable} onModelChange={onModelChange} onThinkingChange={onThinkingChange} onReorderQueuedTurn={onReorderQueuedTurn} onRemoveQueuedTurn={onRemoveQueuedTurn} onSteerQueuedTurn={onSteerQueuedTurn} onEditQueuedTurn={onEditQueuedTurn} /></Suspense></div></div>
  </div>;
}
