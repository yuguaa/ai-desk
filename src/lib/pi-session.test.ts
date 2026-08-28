import { describe, expect, it } from "vitest";
import { projectPiSession, textFromContent, textFromMessageContent } from "@/lib/pi-session";

describe("Pi session projection", () => {
  it("keeps assistant正文和 thinking 分离", () => {
    expect(textFromContent([{ type: "thinking", thinking: "推理" }, { type: "text", text: "正文" }])).toBe("推理\n正文");
    expect(textFromMessageContent([{ type: "thinking", thinking: "推理" }, { type: "text", text: "正文" }])).toBe("正文");
  });

  it("does not duplicate tool results that already belong to an assistant tool call", () => {
    const timeline = projectPiSession([
      {
        id: "a1",
        type: "message",
        timestamp: "2026-08-28T10:00:00.000Z",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "分析步骤" },
            { type: "toolCall", id: "tool-1", name: "bash", arguments: "ls" },
            { type: "text", text: "最终正文" },
          ],
        },
      },
      {
        id: "t1",
        type: "message",
        timestamp: "2026-08-28T10:00:01.000Z",
        message: {
          role: "toolResult",
          toolCallId: "tool-1",
          toolName: "bash",
          content: [{ text: "done" }],
        },
      },
    ] as Record<string, unknown>[]);

    expect(timeline.map((item) => item.type)).toEqual(["reasoning", "tool", "assistant"]);
    expect(timeline.filter((item) => item.type === "tool")).toHaveLength(1);
    expect(timeline.find((item) => item.type === "assistant")).toMatchObject({ text: "最终正文" });
    expect(timeline.find((item) => item.type === "tool")).toMatchObject({ output: "done", command: "ls", status: "completed" });
  });
});
