import { useEffect, useRef, useState } from "react";
import { readAttachments, validateAttachments, type Attachment } from "@/lib/attachments";

type AttachmentDraft = { attachments: Attachment[]; pending: number; error: string | null };
const EMPTY_DRAFT: AttachmentDraft = { attachments: [], pending: 0, error: null };

export function useAttachments(key: string) {
  const [drafts, setDrafts] = useState<Record<string, AttachmentDraft>>({});
  const draftsRef = useRef(drafts);
  const requests = useRef(new Map<string, Set<{ target: string }>>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; requests.current.clear(); };
  }, []);

  const update = (target: string, change: (draft: AttachmentDraft) => AttachmentDraft) => {
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
  const load = (read: () => Promise<Attachment[]>, target = key) => {
    const request = { target };
    const pending = requests.current.get(target) ?? new Set<{ target: string }>();
    pending.add(request);
    requests.current.set(target, pending);
    update(target, (draft) => ({ ...draft, pending: draft.pending + 1, error: null }));
    /* 读取绑定触发时的草稿，不随当前选中的会话改变。 */
    return Promise.resolve().then(read).then((items) => {
      const target = request.target;
      if (!requests.current.get(target)?.has(request)) return;
      const combined = [...(draftsRef.current[target]?.attachments ?? []), ...items];
      validateAttachments(combined);
      update(target, (draft) => ({ ...draft, attachments: combined }));
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
    addFiles: (files: File[]) => load(() => readAttachments(files)),
    remove: (id: string) => update(key, (draft) => ({ ...draft, attachments: draft.attachments.filter((attachment) => attachment.id !== id), error: null })),
    set: (attachments: Attachment[], target = key) => {
      clear(target);
      update(target, () => ({ attachments, pending: 0, error: null }));
    },
    setError: (error: string | null, target = key) => update(target, (draft) => ({ ...draft, error })),
    clear,
  };
}
