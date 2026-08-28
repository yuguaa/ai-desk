import { useState, type DragEvent, type KeyboardEvent } from "react";
import { GripVertical, LayoutList, Pencil, X } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import type { QueuedConversationTurn } from "@/lib/conversation-queue";

export function ConversationQueue({ turns, editingTurnId, onReorder, onRemove, onSteer, onEdit }: { turns: QueuedConversationTurn[]; editingTurnId?: string | null; onReorder?: (sourceId: string, targetId: string) => void; onRemove?: (turnId: string) => void; onSteer?: (turnId: string) => void; onEdit?: (turnId: string) => void }) {
  const [draggingId, setDraggingId] = useState("");
  if (!turns.length) return null;
  const queueLocked = Boolean(editingTurnId);

  const startDrag = (event: DragEvent<HTMLButtonElement>, turnId: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", turnId);
    setDraggingId(turnId);
  };

  const dropTurn = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain") || draggingId;
    setDraggingId("");
    if (sourceId && sourceId !== targetId) onReorder?.(sourceId, targetId);
  };

  const moveByKeyboard = (event: KeyboardEvent<HTMLButtonElement>, turnIndex: number) => {
    const direction = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (!direction) return;
    const target = turns[turnIndex + direction];
    if (!target) return;
    event.preventDefault();
    onReorder?.(turns[turnIndex].id, target.id);
  };

  return <div data-slot="conversation-queue" className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] px-2.5 py-2">
    <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[var(--font-size-10-5)] font-medium text-[var(--text-tertiary)]">
      <LayoutList size={12} />
      <span>待执行队列</span>
      <span className="tabular-nums">{turns.length}</span>
    </div>
    <div className="max-h-28 space-y-1 overflow-y-auto" role="list" aria-label="待执行任务">
      {turns.map((turn, turnIndex) => <div
        key={turn.id}
        role="listitem"
        data-queue-id={turn.id}
        data-editing={editingTurnId === turn.id ? "true" : "false"}
        data-dragging={draggingId === turn.id ? "true" : "false"}
        className="flex min-h-8 items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--bg-workspace)] px-1.5 text-[var(--font-size-11-5)] shadow-[inset_0_0_0_1px_var(--border-subtle)] transition-opacity data-[dragging=true]:opacity-45 data-[editing=true]:bg-[var(--accent-tint-soft)]"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => dropTurn(event, turn.id)}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={queueLocked}
          draggable={Boolean(onReorder) && !queueLocked}
          aria-label={`调整队列任务：${turn.prompt}`}
          title="拖动排序，或使用上下方向键"
          className="size-6 cursor-grab touch-none text-[var(--text-tertiary)] active:cursor-grabbing"
          onDragStart={(event) => startDrag(event, turn.id)}
          onDragEnd={() => setDraggingId("")}
          onKeyDown={(event) => moveByKeyboard(event, turnIndex)}
        ><GripVertical size={13} /></Button>
        <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]" title={turn.prompt}>{turn.prompt}</span>
        <Button type="button" variant="ghost" size="icon-xs" disabled={queueLocked} aria-label={editingTurnId === turn.id ? `正在编辑队列任务：${turn.prompt}` : `编辑队列任务：${turn.prompt}`} title={editingTurnId === turn.id ? "正在编辑" : "编辑"} className="text-[var(--text-tertiary)]" onClick={() => onEdit?.(turn.id)}><Pencil size={12} /></Button>
        <Button type="button" variant="ghost" size="xs" disabled={queueLocked} aria-label={`引导队列任务：${turn.prompt}`} title="立即发送为引导" className="px-1.5 text-[var(--accent)]" onClick={() => onSteer?.(turn.id)}>引导</Button>
        <Button type="button" variant="ghost" size="icon-xs" disabled={queueLocked} aria-label={`移除队列任务：${turn.prompt}`} title="移除" className="text-[var(--text-tertiary)]" onClick={() => onRemove?.(turn.id)}><X size={12} /></Button>
      </div>)}
    </div>
  </div>;
}
