export type QueuedConversationTurn = {
  id: string;
  conversationId: string;
  prompt: string;
  createdAt: number;
};

export function reorderConversationQueue(
  turns: QueuedConversationTurn[],
  sourceId: string,
  targetId: string,
) {
  const sourceIndex = turns.findIndex((turn) => turn.id === sourceId);
  const targetIndex = turns.findIndex((turn) => turn.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return turns;

  const next = [...turns];
  const [source] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, source);
  return next;
}
