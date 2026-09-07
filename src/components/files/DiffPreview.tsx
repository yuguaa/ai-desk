import { memo, useLayoutEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { InlineCode } from "@/components/files/CodeBlock";
import { languageForFile } from "@/components/files/file-language";
import { FileTypeIcon } from "@/components/files/FileTypeIcon";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";

export type DiffRow = {
  leftNumber: number | null;
  rightNumber: number | null;
  left: string | null;
  right: string | null;
};

export const DiffPreview = memo(function DiffPreview({ path, content }: { path: string; content: string }) {
  if (!content.trim()) return <DiffEmptyState message="没有可显示的差异。" />;
  if (content.includes("Binary files") || content.includes("GIT binary patch")) return <DiffEmptyState message="这是二进制文件，暂不支持文本对比。" path={path} />;
  const rows = parseDiff(content);
  const language = languageForFile(path);
  /*
   * 文档切换时重建列表，避免继承上个文件的滚动位置和折行测量缓存。
   */
  return <DiffList key={`${path}\0${content}`} rows={rows} language={language} />;
});

function DiffList({ rows, language }: { rows: DiffRow[]; language: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtual = rows.length > 200;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 21,
    overscan: 8,
    enabled: virtual,
    useAnimationFrameWithResizeObserver: true,
  });

  useLayoutEffect(() => {
    if (!virtual) return;
    const element = scrollRef.current!;
    let width = element.getBoundingClientRect().width;
    let frame: number | null = null;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === width) return;
      width = entry.contentRect.width;
      /*
       * 合并同帧宽度通知，在下一帧清空高度缓存，避免观察回调内触发布局反馈。
       */
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        virtualizer.measure();
      });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [virtual, virtualizer]);

  useLayoutEffect(() => {
    /*
     * 提交后再重测，避免缓存刚清空时仍与旧高度比较，漏写高度未变的行。
     */
    if (virtual) scrollRef.current!.querySelectorAll<HTMLDivElement>("[data-index]").forEach(virtualizer.measureElement);
  });

  const items = virtual ? virtualizer.getVirtualItems() : rows.map((_, index) => ({ index, key: index, start: 0 }));
  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex h-7 shrink-0 items-center border-b border-[var(--border-subtle)] px-[var(--container-padding-tight)] font-mono text-[var(--font-size-9-5)] uppercase tracking-[0.08em] text-[var(--text-tertiary)]"><span className="w-1/2">HEAD</span><span className="w-1/2">工作区</span></div>
    <div ref={scrollRef} data-slot="diff-scroll" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
      <div className="relative w-full min-w-0 font-mono text-[var(--font-size-10-5)] leading-5" style={virtual ? { height: virtualizer.getTotalSize() } : undefined}>
        {items.map((item) => <div key={item.key} data-index={item.index} ref={virtual ? virtualizer.measureElement : undefined} className="grid min-w-0 grid-cols-2" style={virtual ? { position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${item.start}px)` } : undefined}>
          <DiffRowContent row={rows[item.index]} language={language} />
        </div>)}
      </div>
    </div>
  </div>;
}

const DiffRowContent = memo(function DiffRowContent({ row, language }: { row: DiffRow; language: string }) {
  return <><DiffCell number={row.leftNumber} value={row.left} language={language} tone={row.left === null ? "empty" : row.right === null ? "removed" : row.left !== row.right ? "changed" : "context"} /><DiffCell number={row.rightNumber} value={row.right} language={language} tone={row.right === null ? "empty" : row.left === null ? "added" : row.left !== row.right ? "changed" : "context"} /></>;
});

function DiffEmptyState({ message, path }: { message: string; path?: string }) {
  return <Empty className="h-full gap-2 rounded-none border-0 px-5"><EmptyHeader><EmptyMedia><FileTypeIcon name={path ?? "file"} size={20} className="text-[var(--text-tertiary)]" /></EmptyMedia><EmptyDescription className="text-[var(--font-size-11)]">{message}</EmptyDescription></EmptyHeader></Empty>;
}

function DiffCell({ number, value, language, tone }: { number: number | null; value: string | null; language: string; tone: "empty" | "removed" | "added" | "changed" | "context" }) {
  return <div className={`flex min-h-5 min-w-0 border-b border-[var(--border-subtle)] ${tone === "removed" ? "bg-[var(--error-tint)]" : tone === "added" ? "bg-[var(--success-tint)]" : tone === "changed" ? "bg-[var(--warning-tint)]" : ""}`}><span className="w-9 shrink-0 select-none border-r border-[var(--border-subtle)] pr-2 text-right text-[var(--font-size-9)] text-[var(--text-tertiary)]">{number ?? ""}</span><pre className={`m-0 min-w-0 flex-1 overflow-hidden whitespace-pre-wrap [overflow-wrap:anywhere] px-2 ${value === null ? "text-transparent" : "text-[var(--text-secondary)]"}`}>{value === null ? " " : <InlineCode content={value} language={language} />}</pre></div>;
}

export function parseDiff(content: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldNumber = 0;
  let newNumber = 0;
  let pendingRemoved: DiffRow[] = [];
  let removedIndex = 0;
  let inHunk = false;
  const flushRemoved = () => {
    for (; removedIndex < pendingRemoved.length; removedIndex++) rows.push(pendingRemoved[removedIndex]);
    pendingRemoved = [];
    removedIndex = 0;
  };
  content.split("\n").forEach((line) => {
    const hunk = line.match(/^@@ -(\d+)/)?.[1];
    const nextNumber = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/)?.[1];
    if (hunk && nextNumber) {
      flushRemoved();
      oldNumber = Number(hunk);
      newNumber = Number(nextNumber);
      inHunk = true;
      return;
    }
    if (!inHunk || line.startsWith("\\ No newline")) return;
    if (line.startsWith("-")) {
      pendingRemoved.push({ leftNumber: oldNumber++, rightNumber: null, left: line.slice(1), right: null });
      return;
    }
    if (line.startsWith("+")) {
      /*
       * 游标消费删除行，避免大段替换时反复移动整个数组。
       */
      const removed = pendingRemoved[removedIndex];
      if (removed) removedIndex++;
      rows.push({ leftNumber: removed?.leftNumber ?? null, rightNumber: newNumber++, left: removed?.left ?? null, right: line.slice(1) });
      return;
    }
    if (line.startsWith(" ")) {
      flushRemoved();
      rows.push({ leftNumber: oldNumber++, rightNumber: newNumber++, left: line.slice(1), right: line.slice(1) });
    }
  });
  flushRemoved();
  return rows.length ? rows : [{ leftNumber: null, rightNumber: null, left: content, right: content }];
}
