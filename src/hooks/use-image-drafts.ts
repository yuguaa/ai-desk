import { useEffect, useRef, useState } from "react";
import { readImageFiles, validateImageAttachments, type ImageAttachment } from "@/lib/image-attachments";

type ImageDraft = { images: ImageAttachment[]; pending: number; error: string | null };
const EMPTY_DRAFT: ImageDraft = { images: [], pending: 0, error: null };

export function useImageDrafts(key: string) {
  const [drafts, setDrafts] = useState<Record<string, ImageDraft>>({});
  const draftsRef = useRef(drafts);
  const requests = useRef(new Map<string, Set<{ target: string }>>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; requests.current.clear(); };
  }, []);

  const update = (target: string, change: (draft: ImageDraft) => ImageDraft) => {
    if (!mounted.current) return;
    const next = { ...draftsRef.current, [target]: change(draftsRef.current[target] ?? EMPTY_DRAFT) };
    draftsRef.current = next;
    setDrafts(next);
  };
  const clear = (target = key) => {
    requests.current.delete(target);
    const next = { ...draftsRef.current };
    delete next[target];
    draftsRef.current = next;
    setDrafts(next);
  };
  const load = (read: () => Promise<ImageAttachment[]>, target = key) => {
    const request = { target };
    const pending = requests.current.get(target) ?? new Set<{ target: string }>();
    pending.add(request);
    requests.current.set(target, pending);
    update(target, (draft) => ({ ...draft, pending: draft.pending + 1, error: null }));
    /* 读图和截图都绑定触发时的草稿，不随当前选中的会话改变。 */
    return Promise.resolve().then(read).then((images) => {
      const target = request.target;
      if (!requests.current.get(target)?.has(request)) return;
      const combined = [...(draftsRef.current[target]?.images ?? []), ...images];
      validateImageAttachments(combined);
      update(target, (draft) => ({ ...draft, images: combined }));
    }).catch((error: unknown) => {
      const target = request.target;
      if (requests.current.get(target)?.has(request)) update(target, (draft) => ({ ...draft, error: error instanceof Error ? error.message : String(error) }));
    }).finally(() => {
      const target = request.target;
      if (!requests.current.get(target)?.delete(request)) return;
      if (!requests.current.get(target)?.size) requests.current.delete(target);
      update(target, (draft) => ({ ...draft, pending: draft.pending - 1 }));
    });
  };

  return {
    ...(drafts[key] ?? EMPTY_DRAFT),
    load,
    move: (source: string, target: string) => {
      if (source === target || !draftsRef.current[source]) return;
      /* 新建会话接管项目草稿及未完成读取，旧请求继续写入新的归属。 */
      const pending = requests.current.get(source);
      if (pending) {
        pending.forEach((request) => { request.target = target; });
        requests.current.set(target, pending);
      }
      update(target, () => draftsRef.current[source]);
      clear(source);
    },
    addFiles: (files: File[]) => load(() => readImageFiles(files)),
    remove: (id: string) => update(key, (draft) => ({ ...draft, images: draft.images.filter((image) => image.id !== id), error: null })),
    set: (images: ImageAttachment[], target = key) => {
      clear(target);
      update(target, () => ({ images, pending: 0, error: null }));
    },
    setError: (error: string | null, target = key) => update(target, (draft) => ({ ...draft, error })),
    clear,
  };
}
