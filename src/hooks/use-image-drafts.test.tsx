// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useImageDrafts } from "@/hooks/use-image-drafts";
import type { ImageAttachment } from "@/lib/image-attachments";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
const image: ImageAttachment = { id: "one", name: "one.png", type: "image", mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZe0AAAAASUVORK5CYII=" };
let root: Root;
let container: HTMLDivElement;
let draft: ReturnType<typeof useImageDrafts>;
function Harness({ draftKey }: { draftKey: string }) { draft = useImageDrafts(draftKey); return null; }
function render(key = "one") {
  if (!root) { container = document.createElement("div"); root = createRoot(container); }
  act(() => root.render(<Harness draftKey={key} />));
}
afterEach(() => { act(() => root?.unmount()); root = undefined!; container?.remove(); });

describe("image drafts", () => {
  it("项目草稿迁移时保留已有图片和未完成读图，切换后不串会话", async () => {
    render("project:demo");
    act(() => draft.set([image]));
    let finish!: (images: ImageAttachment[]) => void;
    let loading!: Promise<void>;
    act(() => { loading = draft.load(() => new Promise((resolve) => { finish = resolve; })); });
    await act(async () => { await Promise.resolve(); });
    act(() => draft.move("project:demo", "new-conversation"));
    render("new-conversation");
    expect(draft.images).toEqual([image]);
    expect(draft.pending).toBe(1);
    render("other");
    const next = { ...image, id: "two" };
    await act(async () => { finish([next]); await loading; });
    expect(draft.images).toEqual([]);
    render("new-conversation");
    expect(draft.images).toEqual([image, next]);
    expect(draft.pending).toBe(0);
    render("project:demo");
    expect(draft.images).toEqual([]);
  });

  it("异步读图绑定原会话，不污染切换后的草稿", async () => {
    render();
    let finish!: (images: ImageAttachment[]) => void;
    let loading!: Promise<void>;
    act(() => { loading = draft.load(() => new Promise((resolve) => { finish = resolve; })); });
    await act(async () => { await Promise.resolve(); });
    expect(draft.pending).toBe(1);
    render("two");
    expect(draft.pending).toBe(0);
    await act(async () => { finish([image]); await loading; });
    expect(draft.images).toEqual([]);
    render("one");
    expect(draft.images).toEqual([image]);
    expect(draft.pending).toBe(0);
  });

  it("清空后丢弃旧读取结果；失败保留已有附件并显示错误", async () => {
    render();
    let finish!: (images: ImageAttachment[]) => void;
    let loading!: Promise<void>;
    act(() => { loading = draft.load(() => new Promise((resolve) => { finish = resolve; })); });
    await act(async () => { await Promise.resolve(); });
    act(() => draft.clear());
    await act(async () => { finish([image]); await loading; });
    expect(draft.images).toEqual([]);
    act(() => draft.set([image]));
    await act(async () => { await draft.load(() => Promise.reject(new Error("权限未授权"))); });
    expect(draft.images).toEqual([image]);
    expect(draft.error).toBe("权限未授权");
    expect(draft.pending).toBe(0);
    act(() => draft.remove(image.id));
    expect(draft.images).toEqual([]);
  });

  it("并发添加也校验合并数量", async () => {
    render();
    await act(async () => { await Promise.all([
      draft.load(() => Promise.resolve(Array.from({ length: 3 }, (_, id) => ({ ...image, id: String(id) })))),
      draft.load(() => Promise.resolve(Array.from({ length: 3 }, (_, id) => ({ ...image, id: String(id + 3) })))),
    ]); });
    expect(draft.images).toHaveLength(3);
    expect(draft.error).toContain("5 张");
    expect(draft.pending).toBe(0);
  });
});
