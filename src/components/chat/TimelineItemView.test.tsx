// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimelineItemView } from "@/components/chat/TimelineItemView";
import { MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Reasoning } from "@/components/ai-elements/reasoning";
import { Tool } from "@/components/ai-elements/tool";
import type { TimelineItem } from "@/lib/pi-session";

vi.mock("@/components/ai-elements/message", { spy: true });
vi.mock("@/components/ai-elements/reasoning", { spy: true });
vi.mock("@/components/ai-elements/tool", { spy: true });

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.clearAllMocks();
});

describe("TimelineItemView", () => {
  const images = [{ id: "image-1", name: "image-1.png", type: "image" as const, data: "aGVsbG8=", mimeType: "image/png" as const }];

  it.each(["", "   ", "检查图片"])("用户图片回显，正文为 %j 时不产生空泡", (text) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root?.render(<TimelineItemView item={{ id: "user", type: "user", text, time: "现在", images }} />); });
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("data:image/png;base64,aGVsbG8=");
    expect(container.textContent).toContain("现在");
    expect(vi.mocked(MessageContent).mock.calls.length > 0).toBe(Boolean(text.trim()));
    expect(container.querySelector('button[aria-label="复制消息"]') !== null).toBe(Boolean(text.trim()));
    expect(container.querySelector('button[aria-label*="移除"]')).toBeNull();
    if (!text.trim()) expect(vi.mocked(MessageResponse)).not.toHaveBeenCalled();
  });

  it("图片变化时更新回显", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const item: TimelineItem = { id: "user", type: "user", text: "", time: "现在", images };
    act(() => { root?.render(<TimelineItemView item={item} />); });
    act(() => { root?.render(<TimelineItemView item={{ ...item, images: [{ ...images[0], data: "dGVzdA==" }] }} />); });
    expect(container.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,dGVzdA==");
  });

  const user: TimelineItem = { id: "user", type: "user", text: "问题", time: "现在" };
  const assistant: TimelineItem = { id: "assistant", type: "assistant", text: "回答", time: "现在", streaming: true };
  const reasoning: TimelineItem = { id: "reasoning", type: "reasoning", text: "分析", status: "running" };
  const tool: TimelineItem = { id: "tool", type: "tool", name: "bash", command: "pwd", output: "/demo", status: "running" };

  it.each([user, assistant, reasoning, tool])("相同字段的新 $type 对象不重复渲染内容", async (item) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root?.render(<TimelineItemView item={item} />); });
    vi.clearAllMocks();
    await act(async () => { root?.render(<TimelineItemView item={{ ...item }} />); });
    expect(vi.mocked(MessageResponse)).not.toHaveBeenCalled();
    expect(vi.mocked(Reasoning)).not.toHaveBeenCalled();
    expect(vi.mocked(Tool)).not.toHaveBeenCalled();
  });

  it.each<{ label: string; item: TimelineItem; next: TimelineItem; expected: string }>([
    { label: "用户正文", item: user, next: { ...user, text: "新问题" }, expected: "新问题" },
    { label: "用户时间", item: user, next: { ...user, time: "稍后" }, expected: "稍后" },
    { label: "回复正文", item: assistant, next: { ...assistant, text: "新回答" }, expected: "新回答" },
    { label: "思考正文", item: reasoning, next: { ...reasoning, text: "新分析" }, expected: "新分析" },
    { label: "思考完成", item: reasoning, next: { ...reasoning, status: "completed" }, expected: "已完成" },
    { label: "工具名称", item: tool, next: { ...tool, name: "exec" }, expected: "exec" },
    { label: "工具命令", item: tool, next: { ...tool, command: "ls" }, expected: "ls" },
    { label: "工具输出", item: tool, next: { ...tool, output: "new-output" }, expected: "new-output" },
    { label: "工具完成", item: tool, next: { ...tool, status: "completed" }, expected: "完成" },
    { label: "消息类型", item: reasoning, next: { ...assistant, id: reasoning.id }, expected: "回答" },
  ])("字段比较不遗漏$label更新", async ({ item, next, expected }) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root?.render(<TimelineItemView item={item} />); });
    await act(async () => { root?.render(<TimelineItemView item={next} />); });
    expect(container.textContent).toContain(expected);
  });

  it("文本不变时仍切换流式回复为静态渲染", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root?.render(<TimelineItemView item={assistant} />); });
    expect(container.querySelector(".streamdown-message-streaming")).not.toBeNull();
    await act(async () => { root?.render(<TimelineItemView item={{ ...assistant, streaming: false }} />); });
    expect(container.querySelector(".streamdown-message-streaming")).toBeNull();
    expect(container.textContent).toContain("回答");
  });

  it("用户消息自身展示复制操作和时间戳", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<TimelineItemView item={{ id: "user-1", type: "user", text: "检查用户消息", time: "今天 15:40" }} />);
      await Promise.resolve();
    });

    const copyButton = container.querySelector<HTMLButtonElement>('button[aria-label="复制消息"]');
    expect(copyButton).not.toBeNull();
    expect(container.textContent).toContain("今天 15:40");

    await act(async () => {
      copyButton?.click();
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith("检查用户消息");
  });
});
