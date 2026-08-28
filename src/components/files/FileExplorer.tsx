import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Files, RefreshCw, Search } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { FileTypeIcon } from "@/components/files/FileTypeIcon";
import type { WorkspaceFile } from "@/types/workspace";
import { cn } from "@/lib/utils";

type FileTreeNode = WorkspaceFile & { children: FileTreeNode[] };

export function FileExplorer({ files, selectedPath, isLoading, onOpenFile, onRefresh }: { files: WorkspaceFile[]; selectedPath: string | null; isLoading: boolean; onOpenFile: (path: string) => void; onRefresh: () => void }) {
  const [query, setQuery] = useState("");
  const tree = useMemo(() => buildFileTree(files), [files]);
  const rootDirectories = useMemo(() => tree.filter((node) => node.kind === "directory").map((node) => node.path), [tree]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(rootDirectories));
  const visibleTree = useMemo(() => filterTree(tree, query), [query, tree]);
  const filterActive = query.trim().length > 0;

  useEffect(() => {
    if (!rootDirectories.length) return;
    setExpanded((current) => {
      const next = new Set(current);
      rootDirectories.forEach((path) => next.add(path));
      return next;
    });
  }, [rootDirectories]);

  const toggle = (path: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--border-subtle)] p-[var(--container-padding-tight)]"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={13} /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="筛选文件" className="h-7 rounded-[var(--radius-sm)] pl-7 pr-2 text-[var(--font-size-11)] focus-visible:ring-0" /></div><Button type="button" variant="ghost" size="icon-xs" onClick={onRefresh} aria-label="刷新文件树"><RefreshCw size={14} className={cn(isLoading && "animate-spin")} /></Button></div>
    <ScrollArea className="panel-scroll-area min-h-0 flex-1"><div className="min-w-0 p-[var(--container-padding-tight)]">{isLoading && !files.length ? <div className="flex items-center gap-2 px-2 py-3 text-[var(--font-size-11)] text-[var(--text-tertiary)]"><Spinner className="size-3.5" />正在读取文件树…</div> : visibleTree.length ? visibleTree.map((node) => <TreeNodeView key={node.path} node={node} depth={0} expanded={expanded} filterActive={filterActive} selectedPath={selectedPath} onToggle={toggle} onOpenFile={onOpenFile} />) : <Empty className="gap-2 rounded-none border-0 px-4 py-10"><EmptyHeader><EmptyMedia><Files size={20} className="text-[var(--text-tertiary)]" /></EmptyMedia><EmptyDescription className="text-[var(--font-size-11)]">{filterActive ? "没有匹配的文件" : "当前项目没有可预览的文件"}</EmptyDescription></EmptyHeader></Empty>}</div></ScrollArea>
  </div>;
}

function TreeNodeView({ node, depth, expanded, filterActive, selectedPath, onToggle, onOpenFile }: { node: FileTreeNode; depth: number; expanded: Set<string>; filterActive: boolean; selectedPath: string | null; onToggle: (path: string) => void; onOpenFile: (path: string) => void }) {
  const isDirectory = node.kind === "directory";
  const isExpanded = filterActive || expanded.has(node.path);
  return <div className="min-w-0"><Button type="button" variant="ghost" className={cn("flex h-7 w-full min-w-0 shrink justify-start gap-1 overflow-hidden rounded-[var(--radius-sm)] px-0 text-left text-[var(--font-size-11)] font-normal transition-[background-color,color] hover:bg-[var(--bg-hover)]", selectedPath === node.path ? "bg-[var(--accent-tint)] text-[var(--text-primary)]" : "text-[var(--text-secondary)]")} style={{ paddingLeft: `${6 + depth * 14}px` }} onClick={() => isDirectory ? onToggle(node.path) : onOpenFile(node.path)} title={node.path}>{isDirectory ? (isExpanded ? <ChevronDown size={13} className="shrink-0 text-[var(--text-tertiary)]" /> : <ChevronRight size={13} className="shrink-0 text-[var(--text-tertiary)]" />) : <span className="size-[13px] shrink-0" />}<FileTypeIcon name={node.name} directory={isDirectory} open={isExpanded} size={14} className={isDirectory ? "text-[var(--accent)]" : undefined} /><span className="min-w-0 flex-1 truncate">{node.name}</span>{!isDirectory && <span className="shrink-0 font-mono text-[var(--font-size-9)] text-[var(--text-tertiary)]">{formatSize(node.size)}</span>}</Button>{isDirectory && isExpanded && <div className="min-w-0">{node.children.map((child) => <TreeNodeView key={child.path} node={child} depth={depth + 1} expanded={expanded} filterActive={filterActive} selectedPath={selectedPath} onToggle={onToggle} onOpenFile={onOpenFile} />)}</div>}</div>;
}

export function buildFileTree(files: WorkspaceFile[]) {
  const byPath = new Map<string, FileTreeNode>();

  files.forEach((entry) => {
    const parts = entry.path.split("/").filter(Boolean);
    let parentPath = "";
    parts.forEach((part, index) => {
      const path = parentPath ? `${parentPath}/${part}` : part;
      const isLeaf = index === parts.length - 1;
      const existing = byPath.get(path);
      const node = existing ?? {
        path,
        name: part,
        kind: isLeaf ? entry.kind : "directory",
        size: isLeaf ? entry.size : 0,
        children: [],
      };
      if (isLeaf) {
        node.kind = entry.kind;
        node.size = entry.size;
      }
      byPath.set(path, node);
      if (parentPath) {
        const parent = byPath.get(parentPath);
        if (parent && !parent.children.some((child) => child.path === path)) parent.children.push(node);
      }
      parentPath = path;
    });
  });

  return sortTree([...byPath.values()].filter((node) => !node.path.includes("/")));
}

function sortTree(nodes: FileTreeNode[]): FileTreeNode[] {
  return nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  }).map((node) => ({ ...node, children: sortTree(node.children) }));
}

function filterTree(nodes: FileTreeNode[], query: string): FileTreeNode[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return nodes;
  return nodes.flatMap((node) => {
    const children = filterTree(node.children, query);
    if (node.path.toLowerCase().includes(normalized) || children.length) return [{ ...node, children }];
    return [];
  });
}

function formatSize(size: number) {
  if (size < 1024) return `${size}b`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)}k`;
  return `${(size / (1024 * 1024)).toFixed(1)}m`;
}
