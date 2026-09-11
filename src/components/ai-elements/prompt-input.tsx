import { memo, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Input } from "@/components/ui/input";
import { Attachments } from "@/components/chat/Attachments";
import { SlashCommandMenu } from "@/components/chat/SlashCommandMenu";
import type { Attachment } from "@/lib/attachments";
import { ArrowUp, Brain, Check, ChevronDown, Cpu, Paperclip, Square } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConversationQueue } from "@/components/chat/ConversationQueue";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { QueuedConversationTurn } from "@/lib/conversation-queue";
import { contextUsageLabel, piModelDescription, piModelKey, piModelName, thinkingLevelDescription, thinkingLevelLabel } from "@/lib/pi-model-presentation";
import type { PiContextUsage, PiModel } from "@/lib/pi-runtime";
import { combineSlashCommands, filterSlashCommands, slashCommandText, type SlashCommand } from "@/lib/slash-commands";
import { cn } from "@/lib/utils";

type PromptModel = Pick<PiModel, "id" | "name" | "provider">;

type PromptInputState = {
  value: string;
  hasAttachments: boolean;
  attachmentsLoading: boolean;
  submitDisabled: boolean;
  isRunning?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onAbort?: () => void;
  /* 编辑器文本/光标变化时刷新斜杠菜单状态 */
  onSlashInput?: (editor: Editor) => void;
  /* 斜杠菜单打开时拦截方向键、Enter 与 Esc */
  handleSlashMenuKey?: (event: KeyboardEvent) => boolean;
  /* 编辑器失焦时关闭斜杠菜单 */
  onSlashBlur?: () => void;
  /* 斜杠菜单打开时回调（用于补拉 pi 动态命令） */
  onSlashMenuOpen?: () => void;
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
  slashCommands = [],
  onSlashMenuOpen,
  onModelChange,
  onThinkingChange,
  onReorderQueuedTurn,
  onRemoveQueuedTurn,
  onSteerQueuedTurn,
  onEditQueuedTurn,
  attachments = [],
  onAddFiles,
  onRemoveAttachment,
  attachmentsLoading = false,
}: {
  value: string;
  attachments?: Attachment[];
  onAddFiles?: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  attachmentsLoading?: boolean;
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
  slashCommands?: SlashCommand[];
  onSlashMenuOpen?: () => void;
  onModelChange?: (modelKey: string) => void;
  onThinkingChange?: (level: string) => void;
  onReorderQueuedTurn?: (sourceId: string, targetId: string) => void;
  onRemoveQueuedTurn?: (turnId: string) => void;
  onSteerQueuedTurn?: (turnId: string) => void;
  onEditQueuedTurn?: (turnId: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasAttachments = attachments.length > 0;
  const editorRef = useRef<Editor | null>(null);
  /* 插入命令文本后，同一事务内的 onUpdate/selectionUpdate 会重新把菜单带开，用计数器抑制到下个宏任务。 */
  const suppressSlashMenuRef = useRef(0);
  /* 斜杠菜单：/ 触发，展示内置与 pi 动态命令，键盘上下选择、Enter 插入、Esc 关闭。 */
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashMenuQuery, setSlashMenuQuery] = useState("");
  const [slashMenuActive, setSlashMenuActive] = useState(0);
  const availableSlashCommands = useMemo(() => combineSlashCommands(slashCommands), [slashCommands]);
  const filteredSlashCommands = useMemo(() => filterSlashCommands(availableSlashCommands, slashMenuQuery), [availableSlashCommands, slashMenuQuery]);
  /* 菜单交互状态同步进 ref，保证同一 tick 内连续按键读到最新值。 */
  const slashMenuRef = useRef({ open: false, commands: filteredSlashCommands, active: 0 });
  slashMenuRef.current = { open: slashMenuOpen, commands: filteredSlashCommands, active: slashMenuActive };

  const insertSlashCommand = (command: SlashCommand) => {
    const editor = editorRef.current;
    if (!editor) return;
    suppressSlashMenuRef.current += 1;
    const { $from } = editor.state.selection;
    /* 替换光标所在行首的 /片段 为完整命令文本。 */
    editor.chain().focus().deleteRange({ from: $from.start(1), to: $from.pos }).insertContent(slashCommandText(command)).run();
    setSlashMenuOpen(false);
    globalThis.setTimeout(() => { suppressSlashMenuRef.current = Math.max(0, suppressSlashMenuRef.current - 1); }, 0);
  };

  const handleSlashMenuKey = (event: KeyboardEvent) => {
    /* 中文输入法组合确认的 Enter 不参与菜单交互，与发送路径保持一致。 */
    if (event.isComposing || event.keyCode === 229) return false;
    const menu = slashMenuRef.current;
    if (!menu.open) return false;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = menu.commands.length ? Math.min(menu.active + 1, menu.commands.length - 1) : 0;
      slashMenuRef.current = { ...menu, active: next };
      setSlashMenuActive(next);
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const next = Math.max(menu.active - 1, 0);
      slashMenuRef.current = { ...menu, active: next };
      setSlashMenuActive(next);
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setSlashMenuOpen(false);
      return true;
    }
    if (event.key === "Enter") {
      const command = menu.commands[Math.min(menu.active, menu.commands.length - 1)];
      /* 无匹配命令时放行 Enter，走正常发送路径（与 pi TUI 一致）。 */
      if (!command) return false;
      event.preventDefault();
      insertSlashCommand(command);
      return true;
    }
    return false;
  };

  const handleSlashInput = (editor: Editor) => {
    if (suppressSlashMenuRef.current > 0) return;
    const query = slashQueryFromEditor(editor);
    const opening = query !== null && !slashMenuRef.current.open;
    /* 同一事务内 onUpdate 与 selectionUpdate 连续触发，ref 同步更新避免重复回调。 */
    slashMenuRef.current = { ...slashMenuRef.current, open: query !== null };
    setSlashMenuOpen(query !== null);
    if (opening) onSlashMenuOpenRef.current?.();
    if (query !== null) {
      setSlashMenuQuery(query);
      setSlashMenuActive(0);
    }
  };

  const closeSlashMenu = () => setSlashMenuOpen(false);
  const onSlashMenuOpenRef = useRef(onSlashMenuOpen);
  onSlashMenuOpenRef.current = onSlashMenuOpen;

  const inputRef = useRef<PromptInputState>({ value, hasAttachments, attachmentsLoading, submitDisabled, isRunning, onChange, onSubmit, onAbort });
  inputRef.current = { value, hasAttachments, attachmentsLoading, submitDisabled, isRunning, onChange, onSubmit, onAbort, onSlashInput: handleSlashInput, handleSlashMenuKey, onSlashBlur: closeSlashMenu };
  const action = isRunning && !value.trim() && !hasAttachments && !attachmentsLoading ? "中止任务" : editingQueuedTurnId ? "保存队列任务" : isRunning ? "加入队列" : "发送";

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
          onAddFiles?.(files);
        }}
        onDragOver={(event) => { if (Array.from(event.dataTransfer.types).includes("Files")) event.preventDefault(); }}
        onDropCapture={(event) => {
          const files = Array.from(event.dataTransfer.files);
          if (!files.length) return;
          event.preventDefault();
          event.stopPropagation();
          onAddFiles?.(files);
        }}
        onSubmit={(event) => { event.preventDefault(); submitPrompt(inputRef.current); }} className={cn("rounded-[var(--radius-composer)] border border-[var(--composer-border)] bg-[var(--composer-bg)] transition-[background-color,border-color] duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:bg-[var(--composer-bg-hover)] focus-within:border-[var(--accent)] focus-within:bg-[var(--composer-bg-hover)]", className)}>
      {hasAttachments && <div className="px-3 pt-3"><Attachments attachments={attachments} onRemove={onRemoveAttachment} /></div>}
      {attachmentsLoading && <p role="status" className="px-3 pt-3 text-[var(--font-size-11)] text-[var(--text-secondary)]">正在读取附件…</p>}
      <div className="relative">
        {slashMenuOpen && <SlashCommandMenu commands={filteredSlashCommands} activeIndex={Math.min(slashMenuActive, Math.max(filteredSlashCommands.length - 1, 0))} onSelect={insertSlashCommand} onHover={setSlashMenuActive} />}
        <PromptEditor value={value} placeholder={placeholder} action={action} inputRef={inputRef} editorRef={editorRef} />
      </div>
      <div data-slot="prompt-toolbar" className="flex min-w-0 items-center justify-between gap-2 px-2 pb-2 pt-1">
        <div className="flex min-w-0 items-center gap-1">
          {footer}
          {onAddFiles && <>
            <Input ref={fileInputRef} type="file" aria-label="选择附件" multiple hidden onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              if (files.length) onAddFiles(files);
            }} />
            <Button type="button" variant="ghost" size="icon-xs" aria-label="添加附件" title="添加附件" onClick={() => fileInputRef.current?.click()}><Paperclip size={14} /></Button>
          </>}
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
          <ComposerActionButton hasContent={Boolean(value.trim()) || hasAttachments} attachmentsLoading={attachmentsLoading} submitDisabled={submitDisabled} isRunning={Boolean(isRunning)} isEditingQueue={Boolean(editingQueuedTurnId)} onAbort={onAbort} />
        </div>
      </div>
      </form>
    </>
  );
}

/* 正文增量和工具栏更新不重建编辑器配置，事件仍读取最新的提交与中止回调。 */
const PromptEditor = memo(function PromptEditor({ value, placeholder, action, inputRef, editorRef }: {
  value: string;
  placeholder: string;
  action: string;
  inputRef: RefObject<PromptInputState>;
  editorRef: RefObject<Editor | null>;
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
        /* 斜杠菜单打开时方向键、Enter、Esc 用于菜单交互。 */
        if (inputRef.current.handleSlashMenuKey?.(event)) return true;
        if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return false;
        event.preventDefault();
        submitPrompt(inputRef.current);
        return true;
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      inputRef.current.onChange(nextEditor.getText({ blockSeparator: "\n" }));
      inputRef.current.onSlashInput?.(nextEditor);
    },
  });
  editorRef.current = editor;

  useEffect(() => {
    if (!editor) return;
    const current = editor.getText({ blockSeparator: "\n" });
    if (current !== value) editor.commands.setContent(documentFromText(value), { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    if (!editor) return;
    /* 光标移动不触发 onUpdate，订阅 selectionUpdate 保证菜单跟随光标所在行。 */
    const refreshSlashMenu = () => inputRef.current.onSlashInput?.(editor);
    editor.on("selectionUpdate", refreshSlashMenu);
    return () => { editor.off("selectionUpdate", refreshSlashMenu); };
  }, [editor, inputRef]);

  useEffect(() => {
    if (!editor) return;
    editor.view.dom.setAttribute("aria-label", `${placeholder}，Enter ${action}，Shift + Enter 换行`);
  }, [action, editor, placeholder, value]);

  return <div className="relative" onBlurCapture={() => inputRef.current.onSlashBlur?.()}>
    {!value && <span data-slot="prompt-placeholder" className="pointer-events-none absolute left-3.5 top-3 z-10 text-[var(--font-size-13)] leading-5 text-[var(--text-disabled)]">{placeholder}</span>}
    <EditorContent editor={editor} className="prompt-editor" />
  </div>;
});

function submitPrompt({ value, hasAttachments, attachmentsLoading, submitDisabled, isRunning, onAbort, onSubmit }: PromptInputState) {
  if (attachmentsLoading) return;
  if (isRunning && !value.trim() && !hasAttachments) onAbort?.();
  else if (!submitDisabled && (value.trim() || hasAttachments)) onSubmit();
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

/* 计算光标所在行是否处于斜杠命令输入状态，返回 / 后的查询词；否则返回 null。 */
function slashQueryFromEditor(editor: Editor): string | null {
  const { $from } = editor.state.selection;
  const text = $from.parent.textContent ?? "";
  const beforeCursor = text.slice(0, $from.parentOffset);
  const match = /^\/(\S*)$/.exec(beforeCursor);
  return match ? match[1] : null;
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
