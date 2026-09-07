import { lazy, Suspense, useState } from "react";
import { Check, Clipboard, X } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { languageForFile } from "@/components/files/file-language";
import { FileTypeIcon } from "@/components/files/FileTypeIcon";
import type { InspectorPreview } from "@/hooks/use-workspace-inspector";

/*
 * 标题栏只依赖语言映射，选中对应预览类型后才加载高亮和差异模块。
 */
const CodeBlock = lazy(() => import("@/components/files/CodeBlock").then((module) => ({ default: module.CodeBlock })));
const DiffPreview = lazy(() => import("@/components/files/DiffPreview").then((module) => ({ default: module.DiffPreview })));

export function FilePreview({ preview, onClose }: { preview: InspectorPreview; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const isDiff = preview.mode === "diff";
  const copy = () => {
    if (preview.kind !== "text") return;
    navigator.clipboard.writeText(preview.content).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };

  return <div className="flex h-full min-h-0 flex-col"><div className="flex h-9 shrink-0 items-center gap-1 border-b border-[var(--border-subtle)] px-[var(--container-padding-tight)]"><FileTypeIcon name={preview.path} size={14} className="text-[var(--accent)]" /><span className="min-w-0 flex-1 truncate font-mono text-[var(--font-size-10-5)] text-[var(--text-secondary)]">{preview.path}</span><span className="mr-1 font-mono text-[var(--font-size-9)] uppercase text-[var(--text-tertiary)]">{isDiff ? "diff" : preview.kind === "image" ? preview.mimeType.split("/").pop() : languageForFile(preview.path)}</span>{preview.kind === "text" && <Button type="button" variant="ghost" size="icon-xs" onClick={copy} aria-label="复制内容">{copied ? <Check size={14} className="text-[var(--success)]" /> : <Clipboard size={14} />}</Button>}<Button type="button" variant="ghost" size="icon-xs" onClick={onClose} aria-label="关闭预览"><X size={14} /></Button></div>{preview.kind === "image" ? <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4"><img src={`data:${preview.mimeType};base64,${preview.data}`} alt={preview.path} className="max-h-full max-w-full object-contain" /></div> : <Suspense fallback={<div className="min-h-0 flex-1" aria-busy="true" aria-label="正在加载预览" />}>{isDiff ? <DiffPreview path={preview.path} content={preview.content} /> : <div className="min-h-0 flex-1 overflow-auto"><CodeBlock content={preview.content} language={languageForFile(preview.path)} showLineNumbers /></div>}</Suspense>}</div>;
}
