// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chunkRows, PagedTextPreview } from "@/components/files/PagedTextPreview";
import * as bridge from "@/lib/workspace-bridge";
import type { InspectorPreview } from "@/hooks/use-workspace-inspector";
import type { TextFileChunk } from "@/types/workspace";

vi.mock("@/lib/workspace-bridge", () => ({ readWorkspaceFileChunk: vi.fn() }));

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const preview = {
  kind: "pagedText", mode: "file", cwd: "/workspace", path: "中文.txt", size: 1000, version: "version-1",
} satisfies InspectorPreview;
const readChunk = vi.mocked(bridge.readWorkspaceFileChunk);
let root: Root | undefined;
let container: HTMLDivElement;
let clipboardDescriptor: PropertyDescriptor | undefined;
const writeText = vi.fn(() => Promise.resolve());

function deferred() {
  let resolve!: (chunk: TextFileChunk) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<TextFileChunk>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function flush(action: () => void = () => undefined) {
  return Promise.resolve(act(() => { action(); return Promise.resolve(); }));
}

function render(value: typeof preview = preview) {
  act(() => root!.render(<PagedTextPreview preview={value} onClose={vi.fn()} />));
}

function button(label: string) {
  const element = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(element).not.toBeNull();
  return element!;
}

function click(label: string) { act(() => button(label).click()); }
function rows() {
  return Array.from(container.querySelectorAll("[data-index]"), (element) => ({
    label: element.querySelector("span")!.textContent,
    text: element.querySelector("pre")!.textContent,
  }));
}

beforeEach(() => {
  readChunk.mockReset();
  writeText.mockClear();
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  /*
   * 只提供 jsdom 缺少的固定布局尺寸，窗口计算和滚动监听使用真实虚拟器。
   */
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute("data-index") ? 20 : 200;
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container.remove();
  vi.restoreAllMocks();
  if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  else Reflect.deleteProperty(navigator, "clipboard");
});

describe("PagedTextPreview", () => {
  it("按返回的字节 offset 和原 version 请求，前后翻页重新读取并清除旧正文", () => {
    const requests = Array.from({ length: 4 }, deferred);
    requests.forEach((request) => readChunk.mockReturnValueOnce(request.promise));
    render();
    expect(readChunk.mock.calls).toEqual([[preview.cwd, preview.path, 0, preview.version]]);
    expect(button("上一页").disabled).toBe(true);
    expect(button("下一页").disabled).toBe(true);
    expect(button("复制当前页").disabled).toBe(true);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    return flush(() => requests[0].resolve({ content: "中文\n前页", nextOffset: 13, size: 1000 })).then(() => {
      expect(rows()).toEqual([{ label: "1", text: "中文" }, { label: "2", text: "前页" }]);
      click("下一页");
      expect(rows()).toEqual([]);
      expect(button("下一页").disabled).toBe(true);
      expect(button("上一页").disabled).toBe(true);
      expect(button("复制当前页").disabled).toBe(true);
      return flush(() => requests[1].resolve({ content: "续行\n后页", nextOffset: 26, size: 1000 }));
    }).then(() => {
      expect(rows()).toEqual([{ label: "2+", text: "续行" }, { label: "3", text: "后页" }]);
      expect(container.querySelector('[role="status"]')?.textContent).toBe("13–26 / 1000 B");
      click("上一页");
      expect(rows()).toEqual([]);
      expect(container.textContent).not.toContain("前页");
      expect(container.textContent).not.toContain("后页");
      return flush(() => requests[2].resolve({ content: "中文\n前页", nextOffset: 13, size: 1000 }));
    }).then(() => {
      expect(rows()[0]).toEqual({ label: "1", text: "中文" });
      expect(button("上一页").disabled).toBe(true);
      click("下一页");
      expect(rows()).toEqual([]);
      expect(readChunk.mock.calls).toEqual([0, 13, 0, 13].map((offset) => [preview.cwd, preview.path, offset, preview.version]));
      return flush(() => requests[3].resolve({ content: "续行\n后页", nextOffset: 26, size: 1000 }));
    }).then(() => {
      expect(rows()).toEqual([{ label: "2+", text: "续行" }, { label: "3", text: "后页" }]);
      expect(container.textContent).toContain("第 2 页");
    });
  });

  it("换行结尾的下一页从下一行开始，文件末尾禁止继续请求", () => {
    readChunk.mockResolvedValueOnce({ content: "第一行\n\n", nextOffset: 11, size: 17 })
      .mockResolvedValueOnce({ content: "末行", nextOffset: 17, size: 17 });
    render();
    return flush().then(() => {
      expect(rows()).toEqual([{ label: "1", text: "第一行" }, { label: "2", text: " " }]);
      click("下一页");
      return flush();
    }).then(() => {
      expect(rows()).toEqual([{ label: "3", text: "末行" }]);
      expect(button("下一页").disabled).toBe(true);
      click("下一页");
      expect(readChunk).toHaveBeenCalledTimes(2);
    });
  });

  it("真实虚拟窗口只挂载部分行，复制包含当前页未挂载正文及原始空白", () => {
    const content = `\t中文\r\n${"超".repeat(1025)}\n${Array.from({ length: 200 }, (_, index) => `行 ${index}`).join("\n")}\n`;
    readChunk.mockResolvedValueOnce({ content, nextOffset: 900, size: 1000 })
      .mockResolvedValueOnce({ content: "\t下一页原文\r\n", nextOffset: 1000, size: 1000 });
    render();
    return flush().then(() => {
      expect(rows().length).toBeGreaterThan(0);
      expect(rows().length).toBeLessThan(40);
      expect(container.textContent).not.toContain("行 199");
      return flush(() => button("复制当前页").click());
    }).then(() => {
      expect(writeText.mock.calls).toEqual([[content]]);
      expect(container.querySelector('[role="status"]')?.textContent).toBe("已复制当前页");
      click("下一页");
      expect(container.textContent).not.toContain("已复制当前页");
      return flush();
    }).then(() => flush(() => button("复制当前页").click())).then(() => {
      expect(writeText.mock.calls).toEqual([[content], ["\t下一页原文\r\n"]]);
      expect(readChunk).toHaveBeenCalledTimes(2);
    });
  });

  it.each([0, 1])("第 %i 页加载失败后禁止前进，不继续读取", (page) => {
    const request = deferred();
    if (page) readChunk.mockResolvedValueOnce({ content: "前页", nextOffset: 6, size: 1000 });
    readChunk.mockReturnValueOnce(request.promise);
    render();
    return flush().then(() => {
      if (page) click("下一页");
      return flush(() => request.reject(new Error("读取失败")));
    }).then(() => {
      expect(container.querySelector('[role="alert"]')?.textContent).toContain("读取失败");
      expect(rows()).toEqual([]);
      expect(button("下一页").disabled).toBe(true);
      expect(button("上一页").disabled).toBe(true);
      expect(button("复制当前页").disabled).toBe(true);
      click("下一页");
      expect(readChunk).toHaveBeenCalledTimes(page + 1);
    });
  });

  it.each(["resolve", "reject"] as const)("version 变化后忽略旧请求的 %s，不覆盖新正文或错误状态", (outcome) => {
    const old = deferred();
    readChunk.mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ content: "新正文", nextOffset: 9, size: 9 });
    render();
    render({ ...preview, version: "version-2" });
    return flush().then(() => {
      expect(rows()).toEqual([{ label: "1", text: "新正文" }]);
      return flush(() => {
        if (outcome === "resolve") old.resolve({ content: "过期正文", nextOffset: 12, size: 1000 });
        else old.reject(new Error("过期错误"));
      });
    }).then(() => {
      expect(rows()).toEqual([{ label: "1", text: "新正文" }]);
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(button("下一页").disabled).toBe(true);
      expect(readChunk.mock.calls).toEqual([
        [preview.cwd, preview.path, 0, "version-1"], [preview.cwd, preview.path, 0, "version-2"],
      ]);
    });
  });

  it.each(["resolve", "reject"] as const)("卸载后请求 %s 不重新渲染或污染后续挂载", (outcome) => {
    const pending = deferred();
    const consoleError = vi.spyOn(console, "error");
    readChunk.mockReturnValueOnce(pending.promise);
    render();
    act(() => root!.unmount());
    root = undefined;
    return flush(() => {
      if (outcome === "resolve") pending.resolve({ content: "已卸载正文", nextOffset: 15, size: 1000 });
      else pending.reject(new Error("已卸载错误"));
    }).then(() => {
      expect(container.childElementCount).toBe(0);
      expect(readChunk).toHaveBeenCalledTimes(1);
      readChunk.mockResolvedValueOnce({ content: "新挂载正文", nextOffset: 15, size: 15 });
      root = createRoot(container);
      render();
      return flush();
    }).then(() => {
      expect(rows()).toEqual([{ label: "1", text: "新挂载正文" }]);
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(consoleError).not.toHaveBeenCalled();
    });
  });
});

describe("chunkRows", () => {
  it("中文长行按 512 个码点拆分，补充平面字符不拆坏且续行保留逻辑行号", () => {
    const text = `${"中".repeat(511)}𠮷${"文".repeat(512)}尾`;
    const result = chunkRows(`${text}\n下一行`, { offset: 0, line: 7, continuation: false });
    expect(result).toEqual([
      { label: "7", text: `${"中".repeat(511)}𠮷` },
      { label: "7+", text: "文".repeat(512) },
      { label: "7+", text: "尾" },
      { label: "8", text: "下一行" },
    ]);
    expect(result.slice(0, 3).map((row) => row.text).join("")).toBe(text);
  });

  it("跨页续行只标记首个逻辑行，后续换行正常递增", () => {
    expect(chunkRows(`${"续".repeat(513)}\n\n结束\n`, { offset: 1234, line: 42, continuation: true })).toEqual([
      { label: "42+", text: "续".repeat(512) }, { label: "42+", text: "续" },
      { label: "43", text: "" }, { label: "44", text: "结束" },
    ]);
    expect(chunkRows("\n下一行", { offset: 1234, line: 42, continuation: true })).toEqual([
      { label: "42+", text: "" }, { label: "43", text: "下一行" },
    ]);
  });

  it.each([0, 511, 512, 513, 1024])("%i 字符边界不生成多余续行", (length) => {
    const result = chunkRows("字".repeat(length), { offset: 0, line: 1, continuation: false });
    expect(result).toHaveLength(Math.max(1, Math.ceil(length / 512)));
    expect(result.map((row) => row.text).join("")).toBe("字".repeat(length));
    expect(result.map((row) => row.label)).toEqual(result.map((_, index) => index ? "1+" : "1"));
  });

  it("保留 CRLF、空行及制表符，不为末尾换行生成额外行", () => {
    expect(chunkRows("\t中文\r\n\n", { offset: 0, line: 1, continuation: false })).toEqual([
      { label: "1", text: "\t中文\r" }, { label: "2", text: "" },
    ]);
  });
});
