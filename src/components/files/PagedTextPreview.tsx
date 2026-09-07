import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowLeft, ArrowRight, Clipboard, X } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { readWorkspaceFileChunk } from "@/lib/workspace-bridge";
import type { InspectorPreview } from "@/hooks/use-workspace-inspector";
import type { TextFileChunk } from "@/types/workspace";

type PagePosition = { offset: number; line: number; continuation: boolean };

export function PagedTextPreview({ preview, onClose }: {
  preview: Extract<InspectorPreview, { kind: "pagedText" }>;
  onClose: () => void;
}) {
  const [positions, setPositions] = useState<PagePosition[]>([{ offset: 0, line: 1, continuation: false }]);
  const [page, setPage] = useState(0);
  const [chunk, setChunk] = useState<TextFileChunk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const position = positions[page];

  useEffect(() => {
    let active = true;
    setChunk(null);
    setError(null);
    setCopied(false);
    readWorkspaceFileChunk(preview.cwd, preview.path, position.offset, preview.version)
      .then((result) => { if (active) setChunk(result); })
      .catch((reason) => { if (active) setError(String(reason)); });
    return () => { active = false; };
  }, [preview.cwd, preview.path, preview.version, position.offset]);

  const next = () => {
    if (!chunk || chunk.nextOffset >= chunk.size) return;
    const line = position.line + (chunk.content.match(/\n/g)?.length ?? 0);
    setPositions((previous) => [...previous.slice(0, page + 1), {
      offset: chunk.nextOffset, line, continuation: !chunk.content.endsWith("\n"),
    }]);
    setChunk(null);
    setPage(page + 1);
  };

  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-[var(--border-subtle)] px-[var(--container-padding-tight)]">
      <span className="min-w-0 flex-1 truncate font-mono text-[var(--font-size-10-5)]" title={preview.path}>{preview.path}</span>
      <Button variant="ghost" size="icon-xs" aria-label="复制当前页" title="复制当前页" disabled={!chunk} onClick={() => {
        if (chunk) navigator.clipboard.writeText(chunk.content).then(() => setCopied(true)).catch((reason) => setError(String(reason)));
      }}><Clipboard size={14} /></Button>
      <Button variant="ghost" size="icon-xs" aria-label="关闭预览" title="关闭预览" onClick={onClose}><X size={14} /></Button>
    </div>
    {error ? <div role="alert" className="min-h-0 flex-1 overflow-auto p-3 text-[var(--font-size-11)] text-[var(--error)]">{error}</div>
      : chunk ? <ChunkRows key={position.offset} content={chunk.content} position={position} />
        : <div className="min-h-0 flex-1" aria-busy="true" aria-label="正在加载预览" />}
    <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-1 border-t border-[var(--border-subtle)] px-[var(--container-padding-tight)] text-[var(--font-size-10)]">
      <Button variant="ghost" size="icon-xs" aria-label="上一页" title="上一页" disabled={page === 0 || !chunk || !!error} onClick={() => { setChunk(null); setPage(page - 1); }}><ArrowLeft size={14} /></Button>
      <span className="tabular-nums">第 {page + 1} 页</span>
      <Button variant="ghost" size="icon-xs" aria-label="下一页" title="下一页" disabled={!chunk || chunk.nextOffset >= chunk.size || !!error} onClick={next}><ArrowRight size={14} /></Button>
      <span className="ml-auto text-[var(--text-tertiary)]" role="status">{copied ? "已复制当前页" : `${position.offset}–${chunk?.nextOffset ?? position.offset} / ${preview.size} B`}</span>
    </div>
  </div>;
}

/* 单页常驻内存，超长逻辑行分段展示；行号后的 + 表示延续，不改写原文。 */
export function chunkRows(content: string, position: PagePosition) {
  const rows: { text: string; label: string }[] = [];
  let line = position.line;
  let continuation = position.continuation;
  for (const text of content.split("\n")) {
    const characters = Array.from(text);
    for (let index = 0; index < Math.max(1, characters.length); index += 512) {
      rows.push({ text: characters.slice(index, index + 512).join(""), label: `${line}${continuation || index > 0 ? "+" : ""}` });
    }
    line += 1;
    continuation = false;
  }
  if (content.endsWith("\n")) rows.pop();
  return rows;
}

function ChunkRows({ content, position }: { content: string; position: PagePosition }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => chunkRows(content, position), [content, position]);
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => 20, overscan: 8 });
  return <div ref={scrollRef} data-slot="paged-text-scroll" className="min-h-0 flex-1 overflow-auto font-mono text-[var(--font-size-11)]">
    <div style={{ height: virtualizer.getTotalSize(), position: "relative", minWidth: "100%", width: "max-content" }}>
      {virtualizer.getVirtualItems().map((item) => <div key={item.key} data-index={item.index} className="absolute left-0 flex h-5 min-w-full leading-5" style={{ transform: `translateY(${item.start}px)` }}>
        <span className="sticky left-0 shrink-0 select-none bg-[var(--bg-window)] px-2 text-right text-[var(--text-tertiary)]" style={{ width: `${String(position.line + rows.length).length + 3}ch` }}>{rows[item.index].label}</span>
        <pre className="m-0 px-2">{rows[item.index].text || " "}</pre>
      </div>)}
    </div>
  </div>;
}
