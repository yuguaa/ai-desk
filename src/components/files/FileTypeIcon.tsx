import { Archive, FileCode, FileImage, FileText, FileType, File as FileIcon, FolderClosed, FolderOpen, type AnimateIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export function FileTypeIcon({ name, directory = false, open = false, size = 14, className }: { name: string; directory?: boolean; open?: boolean; size?: number; className?: string }) {
  const Icon = directory ? open ? FolderOpen : FolderClosed : iconForFile(name);
  return <Icon size={size} className={cn("text-[var(--text-tertiary)]", className)} />;
}

function iconForFile(name: string): AnimateIcon {
  const lower = name.toLowerCase();
  if (lower.endsWith(".json") || lower.endsWith(".jsonl") || lower.endsWith(".yaml") || lower.endsWith(".yml") || lower.endsWith(".toml")) return FileType;
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".gif") || lower.endsWith(".webp") || lower.endsWith(".bmp") || lower.endsWith(".svg")) return FileImage;
  if (lower.endsWith(".zip") || lower.endsWith(".tar") || lower.endsWith(".gz")) return Archive;
  if (lower.match(/\.(ts|tsx|js|jsx|mjs|cjs|rs|go|py|java|kt|css|scss|html|vue|svelte)$/)) return FileCode;
  if (lower.endsWith(".md") || lower.endsWith(".txt") || lower.endsWith(".log")) return FileText;
  return FileIcon;
}
