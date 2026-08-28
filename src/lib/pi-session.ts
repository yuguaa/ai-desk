export type TimelineItem =
  | { id: string; type: "user"; text: string; time: string; messageId?: string; contentIndex?: number }
  | { id: string; type: "assistant"; text: string; time: string; streaming?: boolean; messageId?: string; contentIndex?: number }
  | { id: string; type: "reasoning"; text: string; status?: "running" | "completed"; messageId?: string; contentIndex?: number }
  | { id: string; type: "tool"; name: string; command: string; output: string; status: "completed" | "running" | "error"; messageId?: string; contentIndex?: number; toolCallId?: string };

type SessionEntry = Record<string, unknown>;
type ToolResultRecord = { output: string; isError: boolean; toolName?: string };

export function textFromContent(content: unknown, options: { includeText?: boolean; includeThinking?: boolean } = {}) {
  const includeText = options.includeText ?? true;
  const includeThinking = options.includeThinking ?? true;
  if (typeof content === "string") return includeText ? content : "";
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => textFromContentPart(part, includeText, includeThinking))
    .filter(Boolean)
    .join("\n");
}

export function textFromMessageContent(content: unknown) {
  return textFromContent(content, { includeThinking: false });
}

export function thinkingFromMessageContent(content: unknown) {
  return textFromContent(content, { includeText: false });
}

export function projectPiSession(entries: SessionEntry[]): TimelineItem[] {
  const output: TimelineItem[] = [];
  const toolResults = new Map<string, ToolResultRecord>();
  const renderedToolCallIds = new Set<string>();

  entries.forEach((entry) => {
    if (entry.type !== "message" || !entry.message || typeof entry.message !== "object") return;
    const message = entry.message as Record<string, unknown>;
    if (message.role !== "toolResult" || typeof message.toolCallId !== "string") return;
    toolResults.set(message.toolCallId, {
      output: textFromContent(message.content),
      isError: message.isError === true,
      toolName: typeof message.toolName === "string" ? message.toolName : undefined,
    });
  });

  entries.forEach((entry, index) => {
    const timestamp = timeFromEntry(entry);
    const entryId = String(entry.id ?? index);

    if (entry.type === "message" && entry.message && typeof entry.message === "object") {
      const message = entry.message as Record<string, unknown>;

      if (message.role === "user") {
        const text = textFromContent(message.content, { includeThinking: false });
        if (text) output.push({ id: entryId, type: "user", text, time: timestamp, messageId: entryId });
      }

      if (message.role === "assistant") {
        output.push(...projectAssistantMessage(entryId, timestamp, message.content, toolResults, renderedToolCallIds));
      }

      if (message.role === "toolResult" && typeof message.toolCallId === "string" && !renderedToolCallIds.has(message.toolCallId)) {
        const result = toolResults.get(message.toolCallId);
        output.push({
          id: `${entryId}-tool-result`,
          type: "tool",
          name: typeof message.toolName === "string" ? message.toolName : result?.toolName ?? "tool",
          command: "",
          output: result?.output ?? "",
          status: result?.isError ? "error" : "completed",
          messageId: entryId,
          toolCallId: message.toolCallId,
        });
      }
    }

    if (entry.type === "compaction" && typeof entry.summary === "string") {
      output.push({ id: entryId, type: "reasoning", text: entry.summary, messageId: entryId });
    }
    if (entry.type === "branch_summary" && typeof entry.summary === "string") {
      output.push({ id: entryId, type: "reasoning", text: entry.summary, messageId: entryId });
    }
    if (entry.type === "message" && entry.message && typeof entry.message === "object" && (entry.message as Record<string, unknown>).role === "bashExecution") {
      const message = entry.message as Record<string, unknown>;
      output.push({ id: entryId, type: "tool", name: "bash", command: typeof message.command === "string" ? message.command : "", output: typeof message.output === "string" ? message.output : "", status: message.cancelled === true || message.exitCode !== 0 ? "error" : "completed", messageId: entryId });
    }
  });

  return output;
}

function projectAssistantMessage(
  entryId: string,
  timestamp: string,
  content: unknown,
  toolResults: Map<string, ToolResultRecord>,
  renderedToolCallIds: Set<string>,
) {
  if (typeof content === "string") return [{ id: `${entryId}-text-0`, type: "assistant", text: content, time: timestamp, messageId: entryId, contentIndex: 0 }] satisfies TimelineItem[];
  if (!Array.isArray(content)) return [] as TimelineItem[];

  return content.flatMap((part, partIndex) => {
    if (!part || typeof part !== "object") return [] as TimelineItem[];
    const value = part as Record<string, unknown>;
    const contentIndex = partIndex;
    const partType = String(value.type ?? "");

    if ((partType === "thinking" || typeof value.thinking === "string") && typeof value.thinking === "string") {
      return [{ id: `${entryId}-thinking-${contentIndex}`, type: "reasoning", text: value.thinking, messageId: entryId, contentIndex } satisfies TimelineItem];
    }

    if ((partType === "text" || typeof value.text === "string") && typeof value.text === "string") {
      return [{ id: `${entryId}-text-${contentIndex}`, type: "assistant", text: value.text, time: timestamp, messageId: entryId, contentIndex } satisfies TimelineItem];
    }

    if (partType === "toolCall") {
      const toolCallId = typeof value.id === "string" ? value.id : undefined;
      if (toolCallId) renderedToolCallIds.add(toolCallId);
      const result = toolCallId ? toolResults.get(toolCallId) : undefined;
      return [{
        id: toolCallId ? `session-tool-${toolCallId}` : `${entryId}-tool-${contentIndex}`,
        type: "tool",
        name: typeof value.name === "string" ? value.name : typeof value.toolName === "string" ? value.toolName : "tool",
        command: stringifyToolValue(value.arguments ?? value.input),
        output: result?.output ?? "等待执行结果…",
        status: result ? result.isError ? "error" : "completed" : "running",
        messageId: entryId,
        contentIndex,
        toolCallId,
      } satisfies TimelineItem];
    }

    return [] as TimelineItem[];
  });
}

function textFromContentPart(part: unknown, includeText: boolean, includeThinking: boolean) {
  if (!part || typeof part !== "object") return "";
  const value = part as Record<string, unknown>;
  if (includeText && typeof value.text === "string") return value.text;
  if (includeThinking && typeof value.thinking === "string") return value.thinking;
  return "";
}

function timeFromEntry(entry: SessionEntry) {
  const timestamp = typeof entry.timestamp === "string" ? entry.timestamp : "";
  return timestamp ? new Date(timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "刚刚";
}

function stringifyToolValue(value: unknown) {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return JSON.stringify(value);
}
