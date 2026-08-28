import { lazy, Suspense, useState } from "react";
import { MessageSquarePlus } from "@/components/ui/icons";
import { Conversation } from "@/components/ai-elements/conversation";
import { ConversationChangesBar } from "@/components/chat/ConversationChangesBar";
import { ExtensionUiPanel } from "@/components/extension/ExtensionUiPanel";
import { Mascot } from "@/components/mascot/Mascot";
import type { AppSettings } from "@/lib/app-settings";
import { getConversationTurnFingerprint, type ConversationTurnChanges } from "@/lib/conversation-changes";
import type { QueuedConversationTurn } from "@/lib/conversation-queue";
import type { TimelineItem } from "@/lib/pi-session";
import type { PiContextUsage, PiExtensionResponse, PiModel } from "@/lib/pi-runtime";

const PromptInput = lazy(() => import("@/components/ai-elements/prompt-input").then((module) => ({ default: module.PromptInput })));
const TimelineItemView = lazy(() => import("@/components/chat/TimelineItemView").then((module) => ({ default: module.TimelineItemView })));

export function ChatPanel({ timeline, draft, isBusy, queuedTurns, editingQueuedTurnId, turnChanges, settings, models, selectedModel, thinkingLevel, thinkingLevels, contextUsage, runtimeAvailable, activeExtensionRequest, extensionNotifications, extensionStatuses, extensionWidgets, onModelChange, onThinkingChange, onReorderQueuedTurn, onRemoveQueuedTurn, onSteerQueuedTurn, onEditQueuedTurn, onDraftChange, onSend, onAbort, onViewChanges, onRefreshChanges, onPreviewChange, onRespondToExtensionUi }: { timeline: TimelineItem[]; draft: string; isBusy: boolean; queuedTurns?: QueuedConversationTurn[]; editingQueuedTurnId?: string | null; turnChanges: Record<number, ConversationTurnChanges>; settings: AppSettings; models: PiModel[]; selectedModel: PiModel | null; thinkingLevel: string | null; thinkingLevels: string[]; contextUsage: PiContextUsage | null; runtimeAvailable: boolean; activeExtensionRequest: unknown; extensionNotifications: unknown[]; extensionStatuses: unknown[]; extensionWidgets: unknown[]; onModelChange: (modelKey: string) => void; onThinkingChange: (level: string) => void; onReorderQueuedTurn?: (sourceId: string, targetId: string) => void; onRemoveQueuedTurn?: (turnId: string) => void; onSteerQueuedTurn?: (turnId: string) => void; onEditQueuedTurn?: (turnId: string) => void; onDraftChange: (value: string) => void; onSend: () => void; onAbort: () => void; onViewChanges: () => void; onRefreshChanges: (turnIndex: number) => void; onPreviewChange: (turnIndex: number, path: string) => void; onRespondToExtensionUi: (response: PiExtensionResponse) => void }) {
  const [scrollToBottomTrigger, setScrollToBottomTrigger] = useState(0);
  let turnIndex = -1;
  let promptFingerprint = "";
  const sendMessage = () => {
    if (!draft.trim()) return;
    onSend();
    setScrollToBottomTrigger((current) => current + 1);
  };

  return <div className="flex min-h-0 flex-1 flex-col bg-[var(--bg-workspace)]">
    <ExtensionUiPanel request={activeExtensionRequest} notifications={extensionNotifications} statuses={extensionStatuses} widgets={extensionWidgets} onRespond={onRespondToExtensionUi} />
    <div className="relative isolate min-h-0 flex-1 overflow-hidden">
      <Mascot style={settings.mascotStyle} enabled={settings.mascotEnabled} motion={settings.mascotMotion} className="mascot-backdrop pointer-events-none absolute -bottom-[10%] right-[2%] z-0 h-[96%] max-h-[760px] max-w-[42%]" />
      <Conversation className="relative z-10 h-full" scrollToBottomTrigger={scrollToBottomTrigger}>
        <div className="w-full px-[var(--container-padding)] pb-[var(--container-padding-loose)] pt-[var(--container-padding)]">
          <div data-slot="conversation-content" className="conversation-column flex flex-col">
            {timeline.map((item, itemIndex) => {
              if (item.type === "user") {
                turnIndex += 1;
                promptFingerprint = getConversationTurnFingerprint(item.text);
              }
              const currentTurnIndex = turnIndex;
              const currentChange = turnChanges[currentTurnIndex];
              const matchedChange = currentChange?.promptFingerprint === promptFingerprint ? currentChange : undefined;
              const isTurnEnd = currentTurnIndex >= 0 && (itemIndex === timeline.length - 1 || timeline[itemIndex + 1]?.type === "user");
              return <div key={item.id} className="contents"><Suspense fallback={<div className="min-h-8" aria-busy="true" />}><TimelineItemView item={item} /></Suspense>{isTurnEnd && matchedChange?.phase === "completed" && <ConversationChangesBar change={matchedChange} onViewChanges={onViewChanges} onRefresh={() => onRefreshChanges(currentTurnIndex)} onPreviewChange={(path) => onPreviewChange(currentTurnIndex, path)} />}</div>;
            })}
            {!timeline.length && <div className="grid min-h-[46vh] place-items-center"><div className="max-w-[280px] text-center"><MessageSquarePlus className="mx-auto size-5 text-[var(--text-tertiary)]" /><h2 className="mt-2 text-[var(--font-size-12-5)] font-medium text-[var(--text-secondary)]">开始一个新对话</h2><p className="mt-1 text-[var(--font-size-11-5)] leading-snug text-[var(--text-tertiary)]">选择项目，然后输入要处理的本地任务。</p></div></div>}
          </div>
        </div>
      </Conversation>
    </div>
    <div data-slot="conversation-composer" className="shrink-0 bg-[var(--bg-workspace)] px-[var(--container-padding)] pb-[var(--container-padding)] pt-[var(--container-padding-tight)]"><div className="conversation-column"><Suspense fallback={<div className="h-[116px] rounded-[var(--radius-composer)] bg-[var(--composer-bg)]" aria-busy="true" />}><PromptInput value={draft} onChange={onDraftChange} onSubmit={sendMessage} onAbort={onAbort} isRunning={isBusy} queuedTurns={queuedTurns} editingQueuedTurnId={editingQueuedTurnId} models={models} selectedModel={selectedModel} thinkingLevel={thinkingLevel} thinkingLevels={thinkingLevels} contextUsage={contextUsage} runtimeAvailable={runtimeAvailable} onModelChange={onModelChange} onThinkingChange={onThinkingChange} onReorderQueuedTurn={onReorderQueuedTurn} onRemoveQueuedTurn={onRemoveQueuedTurn} onSteerQueuedTurn={onSteerQueuedTurn} onEditQueuedTurn={onEditQueuedTurn} /></Suspense></div></div>
  </div>;
}
