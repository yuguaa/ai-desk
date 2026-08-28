// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtensionUiPanel } from "@/components/extension/ExtensionUiPanel";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe("ExtensionUiPanel", () => {
  it("渲染 notify/status/widget，并为 confirm 请求返回 extension_ui_response", async () => {
    const onRespond = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ExtensionUiPanel
        request={{ id: "confirm-1", method: "confirm", title: "允许继续？", message: "将读取项目配置。" }}
        notifications={[{ id: "note-1", message: "扩展已接管本轮输入", notifyType: "warning" }]}
        statuses={[{ id: "status-1", statusKey: "review", statusText: "等待确认" }]}
        widgets={[{ id: "widget-1", widgetKey: "summary", widgetPlacement: "aboveEditor", widgetLines: ["Plan", "- 检查配置"] }]}
        onRespond={onRespond}
      />);
    });

    expect(container.textContent).toContain("扩展已接管本轮输入");
    expect(container.textContent).toContain("等待确认");
    expect(container.textContent).toContain("检查配置");

    const confirmButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("确认"));
    act(() => confirmButton?.click());

    expect(onRespond).toHaveBeenCalledWith({ type: "extension_ui_response", id: "confirm-1", confirmed: true });
  });

  it("提交 editor 请求时返回编辑后的文本", async () => {
    const onRespond = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ExtensionUiPanel
        request={{ id: "editor-1", method: "editor", title: "编辑说明", prefill: "Line 1" }}
        notifications={[]}
        statuses={[]}
        widgets={[]}
        onRespond={onRespond}
      />);
    });

    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
    await act(async () => {
      if (!textarea) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(textarea, "Line 1\nLine 2");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const form = container.querySelector("form");
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(onRespond).toHaveBeenCalledWith({ type: "extension_ui_response", id: "editor-1", value: "Line 1\nLine 2" });
  });
});
