import { describe, expect, it } from "vitest";
import { goalFromSessionEntries, imagesFromContent, projectPiSession, textFromContent, textFromMessageContent } from "@/lib/pi-session";

const image = { type: "image", data: "aGVsbG8=", mimeType: "image/png" };

describe("imagesFromContent", () => {
  it("保留四种合法图片并基于消息和原始块位置生成稳定标识", () => {
    const content = [{ type: "text", text: "图片" }, ...["png", "jpeg", "webp", "gif"].map((extension) => ({ ...image, mimeType: `image/${extension}` }))];
    const images = imagesFromContent(content, "user-1");
    expect(images).toEqual(["png", "jpeg", "webp", "gif"].map((extension, index) => ({
      ...image, mimeType: `image/${extension}`, id: `user-1-image-${index + 1}`, name: `image-${index + 2}.${extension}`,
    })));
    expect(imagesFromContent(structuredClone(content), "user-1")).toEqual(images);
    expect(imagesFromContent(content, "user-2")[0].id).not.toBe(images[0].id);
  });

  it.each([null, undefined, "text", {}, [null, 123, "image", {}]])("忽略非图片内容 %j", (content) => {
    expect(imagesFromContent(content, "user")).toEqual([]);
  });

  it.each([
    { mimeType: "image/svg+xml" }, { mimeType: "image/avif" }, { mimeType: "text/html" },
    { mimeType: "image/png; charset=utf-8" }, { mimeType: null }, { type: "text" },
    { data: "https://example.com/image.png" }, { data: "//example.com/image.png" },
    { data: "data:image/png;base64,aGVsbG8=" }, { data: "" }, { data: null },
    { data: 123 }, { data: "abc" }, { data: "a===" }, { data: "ab=c" }, { data: "ab c" },
  ])("拒绝不可信图片 %j，但保留同消息中的合法图片", (invalid) => {
    expect(imagesFromContent([{ ...image, ...invalid }, image], "user")).toEqual([
      { ...image, id: "user-image-1", name: "image-2.png" },
    ]);
  });
});

describe("Pi session projection", () => {
  it.each(["", "检查图片"])("历史保留图片消息，正文为 %j", (text) => {
    const entries = [{ id: "user-1", type: "message", message: { role: "user", content: [{ type: "text", text }, image] } }];
    const timeline = projectPiSession(entries);
    expect(timeline).toEqual([{ id: "user-1", messageId: "user-1", type: "user", text, time: "刚刚", images: imagesFromContent(entries[0].message.content, "user-1") }]);
    expect(projectPiSession(entries)).toEqual(timeline);
  });

  it("不为非法纯图片内容生成消息，纯文本保持原结构", () => {
    expect(projectPiSession([
      { id: "bad", type: "message", message: { role: "user", content: [{ ...image, data: "https://example.com/a.png" }] } },
      { id: "text", type: "message", message: { role: "user", content: "正文" } },
    ])).toEqual([{ id: "text", messageId: "text", type: "user", text: "正文", time: "刚刚" }]);
  });

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

describe("goalFromSessionEntries", () => {
  it("从最近的 pi-goal 事件提取目标与状态", () => {
    const entries = [
      { type: "message", id: "1" },
      { type: "custom_message", customType: "pi-goal-event", details: { kind: "active", goal: { objective: "修复滚动", status: "active" } } },
    ];
    expect(goalFromSessionEntries(entries)).toEqual({ objective: "修复滚动", status: "active" });
  });

  it("cleared 事件清除目标", () => {
    const entries = [
      { type: "custom_message", customType: "pi-goal-event", details: { kind: "cleared", goal: { objective: "修复滚动", status: "active" } } },
    ];
    expect(goalFromSessionEntries(entries)).toBeNull();
  });

  it("没有 pi-goal 事件时返回 null", () => {
    expect(goalFromSessionEntries([{ type: "message", id: "1" }])).toBeNull();
  });
});
