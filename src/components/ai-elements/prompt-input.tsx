import { memo, useEffect, useRef, type ReactNode, type RefObject } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Input } from "@/components/ui/input";
import { ImageAttachments } from "@/components/chat/ImageAttachments";
import type { ImageAttachment } from "@/lib/image-attachments";
import { ArrowUp, Brain, Check, ChevronDown, Cpu, FileImage, Monitor, Square } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConversationQueue } from "@/components/chat/ConversationQueue";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { QueuedConversationTurn } from "@/lib/conversation-queue";
import { contextUsageLabel, piModelDescription, piModelKey, piModelName, thinkingLevelDescription, thinkingLevelLabel } from "@/lib/pi-model-presentation";
import type { PiContextUsage, PiModel } from "@/lib/pi-runtime";
import { cn } from "@/lib/utils";

type PromptModel = Pick<PiModel, "id" | "name" | "provider">;

type PromptInputState = {
  value: string;
  hasImages: boolean;
  attachmentsLoading: boolean;
  submitDisabled: boolean;
  isRunning?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onAbort?: () => void;
};

export function PromptInput({
  value,
  onChange,
  onSubmit,
  onAbort,
  isRunning,
  submitDisabled = false,
  footer,
  className,
  placeholder = "随心输入",
  models = [],
  selectedModel,
  thinkingLevel,
  thinkingLevels = [],
  contextUsage,
  runtimeAvailable = true,
  queuedTurns = [],
  editingQueuedTurnId,
  onModelChange,
  onThinkingChange,
  onReorderQueuedTurn,
  onRemoveQueuedTurn,
  onSteerQueuedTurn,
  onEditQueuedTurn,
  images = [],
  onAddImages,
  onRemoveImage,
  attachmentsLoading = false,
  attachmentError,
  onCaptureScreenshot,
}: {
  value: string;
  images?: ImageAttachment[];
  onAddImages?: (files: File[]) => void;
  onRemoveImage?: (id: string) => void;
  attachmentsLoading?: boolean;
  attachmentError?: string | null;
  onCaptureScreenshot?: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isRunning?: boolean;
  submitDisabled?: boolean;
  onAbort?: () => void;
  footer?: ReactNode;
  className?: string;
  placeholder?: string;
  models?: PromptModel[];
  selectedModel?: PromptModel | null;
  thinkingLevel?: string | null;
  thinkingLevels?: string[];
  contextUsage?: PiContextUsage | null;
  runtimeAvailable?: boolean;
  queuedTurns?: QueuedConversationTurn[];
  editingQueuedTurnId?: string | null;
  onModelChange?: (modelKey: string) => void;
  onThinkingChange?: (level: string) => void;
  onReorderQueuedTurn?: (sourceId: string, targetId: string) => void;
  onRemoveQueuedTurn?: (turnId: string) => void;
  onSteerQueuedTurn?: (turnId: string) => void;
  onEditQueuedTurn?: (turnId: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasImages = images.length > 0;
  const inputRef = useRef<PromptInputState>({ value, hasImages, attachmentsLoading, submitDisabled, isRunning, onChange, onSubmit, onAbort });
  inputRef.current = { value, hasImages, attachmentsLoading, submitDisabled, isRunning, onChange, onSubmit, onAbort };
  const action = isRunning && !value.trim() && !hasImages && !attachmentsLoading ? "中止任务" : editingQueuedTurnId ? "保存队列任务" : isRunning ? "加入队列" : "发送";

  return (
    <>
      <ConversationQueue turns={queuedTurns} editingTurnId={editingQueuedTurnId} onReorder={onReorderQueuedTurn} onRemove={onRemoveQueuedTurn} onSteer={onSteerQueuedTurn} onEdit={onEditQueuedTurn} />
      <form
        onPasteCapture={(event) => {
          const files = Array.from(event.clipboardData.files);
          if (!files.length) return;
          /* 文件由附件层读取，阻止编辑器将图片写入正文。 */
          event.preventDefault();
          event.stopPropagation();
          onAddImages?.(files);
        }}
        onDragOver={(event) => { if (Array.from(event.dataTransfer.types).includes("Files")) event.preventDefault(); }}
        onDropCapture={(event) => {
          const files = Array.from(event.dataTransfer.files);
          if (!files.length) return;
          event.preventDefault();
          event.stopPropagation();
          onAddImages?.(files);
        }}
        onSubmit={(event) => { event.preventDefault(); submitPrompt(inputRef.current); }} className={cn("overflow-hidden rounded-[var(--radius-composer)] border border-[var(--composer-border)] bg-[var(--composer-bg)] transition-[background-color,border-color] duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:bg-[var(--composer-bg-hover)] focus-within:border-[var(--accent)] focus-within:bg-[var(--composer-bg-hover)]", className)}>
      <PromptEditor value={value} placeholder={placeholder} action={action} inputRef={inputRef} />
      {hasImages && <div className="px-3 pb-2"><ImageAttachments images={images} onRemove={onRemoveImage} /></div>}
      {attachmentsLoading && <p role="status" className="px-3 pb-2 text-[var(--font-size-11)] text-[var(--text-secondary)]">正在读取图片…</p>}
      {attachmentError && <p role="alert" className="break-words px-3 pb-2 text-[var(--font-size-11)] text-[var(--error)]">{attachmentError}</p>}
      <div data-slot="prompt-toolbar" className="flex min-w-0 items-center justify-between gap-2 px-2 pb-2 pt-1">
        <div className="flex min-w-0 items-center gap-1">
          {footer}
          {onAddImages && <>
            <Input ref={fileInputRef} type="file" aria-label="选择图片附件" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              if (files.length) onAddImages(files);
            }} />
            <Button type="button" variant="ghost" size="icon-xs" aria-label="添加图片" title="添加图片" onClick={() => fileInputRef.current?.click()}><FileImage size={14} /></Button>
          </>}
          {onCaptureScreenshot && <Button type="button" variant="ghost" size="icon-xs" aria-label="截图" title="截图" onClick={onCaptureScreenshot}><Monitor size={14} /></Button>}
          <ModelMenu
            models={models}
            selectedModel={selectedModel}
            runtimeAvailable={runtimeAvailable}
            isRunning={Boolean(isRunning)}
            onModelChange={onModelChange}
          />
          <ThinkingMenu
            thinkingLevel={thinkingLevel}
            thinkingLevels={thinkingLevels}
            runtimeAvailable={runtimeAvailable}
            isRunning={Boolean(isRunning)}
            onThinkingChange={onThinkingChange}
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ContextUsageRing usage={contextUsage} />
          <ComposerActionButton hasContent={Boolean(value.trim()) || hasImages} attachmentsLoading={attachmentsLoading} submitDisabled={submitDisabled} isRunning={Boolean(isRunning)} isEditingQueue={Boolean(editingQueuedTurnId)} onAbort={onAbort} />
        </div>
      </div>
      </form>
    </>
  );
}

/* 正文增量和工具栏更新不重建编辑器配置，事件仍读取最新的提交与中止回调。 */
const PromptEditor = memo(function PromptEditor({ value, placeholder, action, inputRef }: {
  value: string;
  placeholder: string;
  action: string;
  inputRef: RefObject<PromptInputState>;
}) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: false, blockquote: false, codeBlock: false, horizontalRule: false, bulletList: false, orderedList: false, listItem: false })],
    content: documentFromText(value),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prompt-editor-content",
        "data-placeholder": placeholder,
        "aria-label": `${placeholder}，Enter 发送，Shift + Enter 换行`,
        "aria-multiline": "true",
        role: "textbox",
      },
      handleKeyDown: (_view, event) => {
        if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return false;
        event.preventDefault();
        submitPrompt(inputRef.current);
        return true;
      },
    },
    onUpdate: ({ editor: nextEditor }) => inputRef.current.onChange(nextEditor.getText({ blockSeparator: "\n" })),
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getText({ blockSeparator: "\n" });
    if (current !== value) editor.commands.setContent(documentFromText(value), { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    if (!editor) return;
    editor.view.dom.setAttribute("aria-label", `${placeholder}，Enter ${action}，Shift + Enter 换行`);
  }, [action, editor, placeholder, value]);

  return <div className="relative">
    {!value && <span data-slot="prompt-placeholder" className="pointer-events-none absolute left-3.5 top-3 z-10 text-[var(--font-size-13)] leading-5 text-[var(--text-disabled)]">{placeholder}</span>}
    <EditorContent editor={editor} className="prompt-editor" />
  </div>;
});

function submitPrompt({ value, hasImages, attachmentsLoading, submitDisabled, isRunning, onAbort, onSubmit }: PromptInputState) {
  if (attachmentsLoading) return;
  if (isRunning && !value.trim() && !hasImages) onAbort?.();
  else if (!submitDisabled && (value.trim() || hasImages)) onSubmit();
}

function ContextUsageRing({ usage }: { usage?: PiContextUsage | null }) {
  // 无数据时按 0% 渲染，弱化视觉，避免误导
  const percent = usage?.percent ?? 0;
  const progress = Math.max(0, Math.min(100, percent));
  const label = contextUsageLabel(usage);
  // tokens 为 null 表示压缩待更新，tooltip 给出明确提示
  const hint = usage?.tokens === null ? "压缩后将在下一次回复完成时更新" : label;
  // 使用率分级：<70% 正常，70-90% 警告，>90% 危险
  const color = progress >= 90 ? "var(--error)" : progress >= 70 ? "var(--warning)" : progress > 0 ? "var(--accent)" : "var(--text-tertiary)";

  return <Tooltip>
    <TooltipTrigger asChild>
      <span data-slot="context-usage" role="img" aria-label={label} tabIndex={0} className="relative grid size-5 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[var(--text-tertiary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)]">
        {/* conic-gradient 画进度弧 + radial-gradient mask 抠出中心圆孔 */}
        <span
          data-progress={progress}
          className="pointer-events-none size-4 rounded-full"
          style={{
            background: `conic-gradient(${color} 0% ${progress}%, var(--text-tertiary) ${progress}% 100%)`,
            opacity: progress > 0 ? 1 : 0.35,
            WebkitMask: "radial-gradient(closest-side, transparent 68%, black 72%)",
            mask: "radial-gradient(closest-side, transparent 68%, black 72%)",
          }}
        />
      </span>
    </TooltipTrigger>
    <TooltipContent side="top" sideOffset={6}>{hint}</TooltipContent>
  </Tooltip>;
}

function ComposerActionButton({ hasContent, attachmentsLoading, submitDisabled, isRunning, isEditingQueue, onAbort }: { hasContent: boolean; attachmentsLoading: boolean; submitDisabled: boolean; isRunning: boolean; isEditingQueue: boolean; onAbort?: () => void }) {
  if (isRunning && !hasContent && !attachmentsLoading) {
    return <Button type="button" variant="destructive" size="icon-sm" disabled={!onAbort} className="size-7 rounded-full" aria-label="中止任务" title="中止任务" onClick={() => onAbort?.()}>
      <Square className="size-3.5 fill-current" />
    </Button>;
  }

  const label = isEditingQueue ? "保存队列任务" : isRunning ? "加入后续队列" : "发送任务";
  return <Button type="submit" variant="default" size="icon-sm" disabled={submitDisabled || attachmentsLoading || !hasContent} className="size-7 rounded-full bg-[var(--composer-submit-bg)] text-[var(--composer-submit-text)] shadow-none hover:bg-[var(--composer-submit-bg-hover)] active:bg-[var(--composer-submit-bg-hover)]" aria-label={label} title={label}>
    <ArrowUp className="size-3.5" />
  </Button>;
}

function ModelMenu({ models, selectedModel, runtimeAvailable, isRunning, onModelChange }: { models: PromptModel[]; selectedModel?: PromptModel | null; runtimeAvailable: boolean; isRunning: boolean; onModelChange?: (modelKey: string) => void }) {
  const disabled = !runtimeAvailable || isRunning || !models.length;
  const triggerLabel = selectedModel ? piModelName(selectedModel) : runtimeAvailable ? "读取模型" : "桌面模式";

  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="ghost" size="xs" disabled={disabled} aria-label={`选择模型，当前 ${triggerLabel}`} title="模型" className="max-w-48 gap-1 rounded-[var(--radius-md)] px-1.5 text-[var(--font-size-11)] font-normal text-[var(--text-secondary)] focus-visible:shadow-[var(--focus-ring)] data-[state=open]:bg-[var(--bg-hover)] data-[state=open]:text-[var(--text-primary)]">
        <Cpu size={12} className="text-[var(--text-tertiary)]" />
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown size={11} className="text-[var(--text-tertiary)]" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" sideOffset={6} className="w-[310px] rounded-[var(--radius-md)] border-[var(--border-default)] bg-[var(--bg-popover)] p-1.5 text-[var(--text-primary)] shadow-[var(--shadow-popover)]">
      <DropdownMenuLabel className="flex items-center gap-1.5 px-2 py-1.5 text-[var(--font-size-10-5)] font-medium text-[var(--text-tertiary)]"><Cpu size={12} />模型</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={selectedModel ? piModelKey(selectedModel) : ""} onValueChange={onModelChange}>
        {models.map((model) => {
          const selected = selectedModel ? piModelKey(selectedModel) === piModelKey(model) : false;
          return <DropdownMenuRadioItem key={piModelKey(model)} value={piModelKey(model)} className="min-h-11 rounded-[var(--radius-sm)] py-1.5 pl-2 pr-2 text-[var(--font-size-12)] text-[var(--text-secondary)] focus:bg-[var(--bg-hover)] focus:text-[var(--text-primary)] [&>span:first-child]:hidden">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-[var(--text-primary)]">{piModelName(model)}</span>
              <span className="mt-0.5 block truncate text-[var(--font-size-10)] text-[var(--text-tertiary)]">{piModelDescription(model)}</span>
            </span>
            {selected && <Check size={13} className="text-[var(--accent)]" />}
          </DropdownMenuRadioItem>;
        })}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}

function ThinkingMenu({ thinkingLevel, thinkingLevels, runtimeAvailable, isRunning, onThinkingChange }: { thinkingLevel?: string | null; thinkingLevels: string[]; runtimeAvailable: boolean; isRunning: boolean; onThinkingChange?: (level: string) => void }) {
  const disabled = !runtimeAvailable || isRunning || !thinkingLevels.length;
  const triggerLabel = thinkingLevelLabel(thinkingLevel);

  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="ghost" size="xs" disabled={disabled} aria-label={`选择思考深度，当前 ${triggerLabel}`} title="思考深度" className="gap-1 rounded-[var(--radius-md)] px-1.5 text-[var(--font-size-11)] font-normal text-[var(--text-secondary)] focus-visible:shadow-[var(--focus-ring)] data-[state=open]:bg-[var(--bg-hover)] data-[state=open]:text-[var(--text-primary)]">
        <Brain size={12} className="text-[var(--text-tertiary)]" />
        <span>{triggerLabel}</span>
        <ChevronDown size={11} className="text-[var(--text-tertiary)]" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" sideOffset={6} className="w-[260px] rounded-[var(--radius-md)] border-[var(--border-default)] bg-[var(--bg-popover)] p-1.5 text-[var(--text-primary)] shadow-[var(--shadow-popover)]">
      <DropdownMenuLabel className="flex items-center gap-1.5 px-2 py-1.5 text-[var(--font-size-10-5)] font-medium text-[var(--text-tertiary)]"><Brain size={12} />思考深度</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={thinkingLevel ?? ""} onValueChange={onThinkingChange}>
        {thinkingLevels.map((level) => {
          const selected = thinkingLevel === level;
          return <DropdownMenuRadioItem key={level} value={level} className="min-h-11 rounded-[var(--radius-sm)] py-1.5 pl-2 pr-2 text-[var(--font-size-12)] text-[var(--text-secondary)] focus:bg-[var(--bg-hover)] focus:text-[var(--text-primary)] [&>span:first-child]:hidden">
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-[var(--text-primary)]">{thinkingLevelLabel(level)}</span>
              <span className="mt-0.5 block text-[var(--font-size-10)] text-[var(--text-tertiary)]">{thinkingLevelDescription(level)}</span>
            </span>
            {selected && <Check size={13} className="text-[var(--accent)]" />}
          </DropdownMenuRadioItem>;
        })}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}

function documentFromText(value: string) {
  const lines = value.split("\n");
  return {
    type: "doc" as const,
    content: lines.map((line) => ({
      type: "paragraph" as const,
      ...(line ? { content: [{ type: "text" as const, text: line }] } : {}),
    })),
  };
}
