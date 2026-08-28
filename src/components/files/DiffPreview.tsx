import { InlineCode, languageForFile } from "@/components/files/CodeBlock";
import { FileTypeIcon } from "@/components/files/FileTypeIcon";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";

export type DiffRow = {
  leftNumber: number | null;
  rightNumber: number | null;
  left: string | null;
  right: string | null;
};

export function DiffPreview({ path, content }: { path: string; content: string }) {
  if (!content.trim()) return <DiffEmptyState message="没有可显示的差异。" />;
  if (content.includes("Binary files") || content.includes("GIT binary patch")) return <DiffEmptyState message="这是二进制文件，暂不支持文本对比。" path={path} />;
  const rows = parseDiff(content);
  const language = languageForFile(path);
  return <div className="flex h-full min-h-0 flex-col"><div className="flex h-7 shrink-0 items-center border-b border-[var(--border-subtle)] px-[var(--container-padding-tight)] font-mono text-[var(--font-size-9-5)] uppercase tracking-[0.08em] text-[var(--text-tertiary)]"><span className="w-1/2">HEAD</span><span className="w-1/2">工作区</span></div><div className="min-h-0 flex-1 overflow-auto"><div className="min-w-[620px] font-mono text-[var(--font-size-10-5)] leading-5">{rows.map((row, index) => <div className="grid grid-cols-2" key={`${index}-${row.leftNumber}-${row.rightNumber}`}><DiffCell number={row.leftNumber} value={row.left} language={language} tone={row.left === null ? "empty" : row.right === null ? "removed" : row.left !== row.right ? "changed" : "context"} /><DiffCell number={row.rightNumber} value={row.right} language={language} tone={row.right === null ? "empty" : row.left === null ? "added" : row.left !== row.right ? "changed" : "context"} /></div>)}</div></div></div>;
}

function DiffEmptyState({ message, path }: { message: string; path?: string }) {
  return <Empty className="h-full gap-2 rounded-none border-0 px-5"><EmptyHeader><EmptyMedia><FileTypeIcon name={path ?? "file"} size={20} className="text-[var(--text-tertiary)]" /></EmptyMedia><EmptyDescription className="text-[var(--font-size-11)]">{message}</EmptyDescription></EmptyHeader></Empty>;
}

function DiffCell({ number, value, language, tone }: { number: number | null; value: string | null; language: string; tone: "empty" | "removed" | "added" | "changed" | "context" }) {
  return <div className={`flex min-h-5 min-w-0 border-b border-[var(--border-subtle)] ${tone === "removed" ? "bg-[var(--error-tint)]" : tone === "added" ? "bg-[var(--success-tint)]" : tone === "changed" ? "bg-[var(--warning-tint)]" : ""}`}><span className="w-9 shrink-0 select-none border-r border-[var(--border-subtle)] pr-2 text-right text-[var(--font-size-9)] text-[var(--text-tertiary)]">{number ?? ""}</span><pre className={`m-0 min-w-0 flex-1 overflow-hidden whitespace-pre-wrap px-2 ${value === null ? "text-transparent" : "text-[var(--text-secondary)]"}`}>{value === null ? " " : <InlineCode content={value} language={language} />}</pre></div>;
}

export function parseDiff(content: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldNumber = 0;
  let newNumber = 0;
  let pendingRemoved: DiffRow[] = [];
  let inHunk = false;
  const flushRemoved = () => {
    pendingRemoved.forEach((row) => rows.push(row));
    pendingRemoved = [];
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
      const removed = pendingRemoved.shift();
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
