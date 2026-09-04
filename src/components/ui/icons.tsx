import type { ComponentType, HTMLAttributes } from "react";
import {
  ArrowDown as ArrowDownIcon,
  ArrowLeft as ArrowLeftIcon,
  ArrowRight as ArrowRightIcon,
  ArrowUp as ArrowUpIcon,
  Bell as BellIcon,
  Brain as BrainIcon,
  Check as CheckIconSource,
  ChevronDown as ChevronDownIcon,
  ChevronRight as ChevronRightIconSource,
  ChevronUp as ChevronUpIcon,
  CircleCheck,
  Clipboard as ClipboardIcon,
  Clock as ClockIcon,
  CodeXml as CodeXmlIcon,
  Copy as CopyIcon,
  Cpu as CpuIcon,
  Diff as DiffIcon,
  Download as DownloadIcon,
  Ellipsis as EllipsisIcon,
  ExternalLink as ExternalLinkIcon,
  File as FileIcon,
  FileArchive,
  FileCode as FileCodeIcon,
  FileImage as FileImageIcon,
  FileText as FileTextIcon,
  FileType as FileTypeIcon,
  Files as FilesIcon,
  Folder as FolderIcon,
  FolderClosed as FolderClosedIcon,
  FolderOpen as FolderOpenIcon,
  FolderPlus as FolderPlusIcon,
  GitBranch as GitBranchIcon,
  GitCommitHorizontal as GitCommitHorizontalIcon,
  GitCompare as GitCompareIcon,
  GripVertical as GripVerticalIcon,
  History as HistoryIcon,
  Info as InfoIcon,
  LayoutList as LayoutListIcon,
  Lightbulb as LightbulbIcon,
  LoaderCircle as LoaderCircleIcon,
  Menu as MenuIcon,
  MessageSquare as MessageSquareIcon,
  MessageSquarePlus as MessageSquarePlusIcon,
  Minus as MinusIcon,
  Monitor as MonitorIcon,
  Moon as MoonIcon,
  MoveDiagonal,
  MoveDiagonal2,
  MoveHorizontal as MoveHorizontalIcon,
  Paperclip as PaperclipIcon,
  Pencil as PencilIcon,
  Pin as PinIcon,
  Plus as PlusIcon,
  RefreshCw as RefreshCwIcon,
  Search as SearchIcon,
  Send as SendIcon,
  Settings as SettingsIcon,
  Share as ShareIcon,
  ShieldCheck as ShieldCheckIcon,
  SlidersHorizontal as SlidersHorizontalIcon,
  Sparkles as SparklesIcon,
  Square as SquareIcon,
  Sun as SunIcon,
  Terminal as TerminalIcon,
  Trash2 as Trash2Icon,
  TriangleAlert as TriangleAlertIcon,
  Undo2 as Undo2Icon,
  UserRound as UserRoundIcon,
  X as XIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type IconProps = Omit<HTMLAttributes<HTMLSpanElement>, "color"> & {
  size?: number;
  color?: string;
};

export type AnimateIcon = ComponentType<IconProps>;

function icon(source: LucideIcon): AnimateIcon {
  return ({ size, color, className, style, ...props }: IconProps) => {
    const Source = source;
    const resolvedSize = size ?? 16;
    return (
      <span
        {...props}
        data-animate-icon="true"
        className={cn("animate-icon-shell size-4", className)}
        style={{ ...(size ? { width: size, height: size } : {}), color, ...style }}
      >
        <span className="animate-icon-motion">
          <Source
            aria-hidden="true"
            size={resolvedSize}
            color="currentColor"
            className="animate-icon size-full"
          />
        </span>
      </span>
    );
  };
}

export const Archive = icon(FileArchive);
export const ArrowDown = icon(ArrowDownIcon);
export const ArrowLeft = icon(ArrowLeftIcon);
export const ArrowRight = icon(ArrowRightIcon);
export const ArrowUp = icon(ArrowUpIcon);
export const Bell = icon(BellIcon);
export const Brain = icon(BrainIcon);
export const Check = icon(CheckIconSource);
export const ChevronDown = icon(ChevronDownIcon);
export const ChevronRight = icon(ChevronRightIconSource);
export const ChevronUp = icon(ChevronUpIcon);
export const Clipboard = icon(ClipboardIcon);
export const Clock = icon(ClockIcon);
export const CodeXml = icon(CodeXmlIcon);
export const Copy = icon(CopyIcon);
export const Cpu = icon(CpuIcon);
export const Diff = icon(DiffIcon);
export const Download = icon(DownloadIcon);
export const Ellipsis = icon(EllipsisIcon);
export const ExternalLink = icon(ExternalLinkIcon);
export const File = icon(FileIcon);
export const FileCode = icon(FileCodeIcon);
export const FileImage = icon(FileImageIcon);
export const FileText = icon(FileTextIcon);
export const FileType = icon(FileTypeIcon);
export const Files = icon(FilesIcon);
export const Folder = icon(FolderIcon);
export const FolderClosed = icon(FolderClosedIcon);
export const FolderOpen = icon(FolderOpenIcon);
export const FolderPlus = icon(FolderPlusIcon);
export const GitBranch = icon(GitBranchIcon);
export const GitCommitHorizontal = icon(GitCommitHorizontalIcon);
export const GitCompare = icon(GitCompareIcon);
export const GripVertical = icon(GripVerticalIcon);
export const History = icon(HistoryIcon);
export const Info = icon(InfoIcon);
export const LayoutList = icon(LayoutListIcon);
export const Lightbulb = icon(LightbulbIcon);
export const LoaderCircle = icon(LoaderCircleIcon);
export const Maximize2 = icon(MoveDiagonal);
export const Menu = icon(MenuIcon);
export const MessageSquarePlus = icon(MessageSquarePlusIcon);
export const MessageSquare = icon(MessageSquareIcon);
export const Minus = icon(MinusIcon);
export const Monitor = icon(MonitorIcon);
export const Moon = icon(MoonIcon);
export const MoveHorizontal = icon(MoveHorizontalIcon);
export const Paperclip = icon(PaperclipIcon);
export const Pencil = icon(PencilIcon);
export const Pin = icon(PinIcon);
export const Plus = icon(PlusIcon);
export const RefreshCw = icon(RefreshCwIcon);
export const Search = icon(SearchIcon);
export const Send = icon(SendIcon);
export const Settings = icon(SettingsIcon);
export const Share = icon(ShareIcon);
export const ShieldCheck = icon(ShieldCheckIcon);
export const SlidersHorizontal = icon(SlidersHorizontalIcon);
export const Sparkles = icon(SparklesIcon);
export const Sun = icon(SunIcon);
export const Terminal = icon(TerminalIcon);
export const Trash2 = icon(Trash2Icon);
export const TriangleAlert = icon(TriangleAlertIcon);
export const Undo2 = icon(Undo2Icon);
export const UserRound = icon(UserRoundIcon);
export const X = icon(XIcon);
export const ZoomIn = icon(MoveDiagonal);
export const ZoomOut = icon(MoveDiagonal2);

/*
 * 统一旧组件名，避免业务组件引入第二套图标来源。
 */
export const CircleDot = icon(CircleCheck);
export const CircleIcon = icon(CircleCheck);
export const Square = icon(SquareIcon);
export const Code2 = CodeXml;
export const MoreHorizontal = Ellipsis;
export const FileCode2 = FileCode;
export const FileJson = FileType;
export const FolderTree = FolderOpen;
export const CircleHelp = Info;
export const RotateCcw = RefreshCw;
export const Settings2 = Settings;
export const Share2 = Share;
export const Wrench = SlidersHorizontal;
export const TerminalSquare = Terminal;
export const CircleAlert = TriangleAlert;
export const CheckIcon = Check;
export const ChevronRightIcon = ChevronRight;
