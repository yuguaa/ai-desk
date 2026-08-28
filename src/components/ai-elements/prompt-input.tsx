import { useEffect, useRef, type ReactNode } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ArrowUp, Brain, Check, ChevronDown, Cpu, Square } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { ConversationQueue } from "@/components/chat/ConversationQueue";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { QueuedConversationTurn } from "@/lib/conversation-queue";
import { contextUsageLabel, piModelDescription, piModelKey, piModelName, thinkingLevelDescription, thinkingLevelLabel } from "@/lib/pi-model-presentation";
import type { PiContextUsage, PiModel } from "@/lib/pi-runtime";
import { cn } from "@/lib/utils";

type PromptModel = Pick<PiModel, "id" | "name" | "provider">;

export function PromptInput({
  value,
  onChange,
  onSubmit,
  onAbort,
  isRunning,
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
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isRunning?: boolean;
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
  const onChangeRef = useRef(onChange);
  const onSubmitRef = useRef(onSubmit);
  const onAbortRef = useRef(onAbort);
  const isRunningRef = useRef(Boolean(isRunning));
  const valueRef = useRef(value);
  onChangeRef.current = onChange;
  onSubmitRef.current = onSubmit;
  onAbortRef.current = onAbort;
  isRunningRef.current = Boolean(isRunning);
  valueRef.current = value;

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
        if (isRunningRef.current && !valueRef.current.trim()) onAbortRef.current?.();
        else onSubmitRef.current();
        return true;
      },
    },
    onUpdate: ({ editor: nextEditor }) => onChangeRef.current(nextEditor.getText({ blockSeparator: "\n" })),
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getText({ blockSeparator: "\n" });
    if (current !== value) editor.commands.setContent(documentFromText(value), { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    if (!editor) return;
    const action = isRunning && !value.trim() ? "中止任务" : editingQueuedTurnId ? "保存队列任务" : isRunning ? "加入队列" : "发送";
    editor.view.dom.setAttribute("aria-label", `${placeholder}，Enter ${action}，Shift + Enter 换行`);
  }, [editingQueuedTurnId, editor, isRunning, placeholder, value]);

  return (
    <form onSubmit={(event) => { event.preventDefault(); if (isRunningRef.current && !valueRef.current.trim()) onAbortRef.current?.(); else onSubmitRef.current(); }} className={cn("overflow-hidden rounded-[var(--radius-composer)] bg-[var(--composer-bg)] shadow-[var(--composer-shadow)] ring-1 ring-inset ring-[var(--composer-border)] transition-[background-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:bg-[var(--composer-bg-hover)] focus-within:bg-[var(--composer-bg-hover)] focus-within:shadow-[var(--composer-shadow-focus)]", className)}>
      <ConversationQueue turns={queuedTurns} editingTurnId={editingQueuedTurnId} onReorder={onReorderQueuedTurn} onRemove={onRemoveQueuedTurn} onSteer={onSteerQueuedTurn} onEdit={onEditQueuedTurn} />
      <div className="relative min-h-[116px]">
        {!value && <span data-slot="prompt-placeholder" className="pointer-events-none absolute left-3.5 top-3 z-10 text-[var(--font-size-13)] leading-5 text-[var(--text-disabled)]">{placeholder}</span>}
        <EditorContent
          editor={editor}
          className="prompt-editor"
        />
        <div className="absolute inset-x-2 bottom-2 z-20 flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            {footer}
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
            <span data-slot="context-usage" className="font-mono text-[var(--font-size-9-5)] text-[var(--text-tertiary)]" title={contextUsage?.tokens === null ? "压缩后将在下一次回复完成时更新" : undefined}>
              {contextUsageLabel(contextUsage)}
            </span>
            <ComposerActionButton value={value} isRunning={Boolean(isRunning)} isEditingQueue={Boolean(editingQueuedTurnId)} onAbort={onAbort} />
          </div>
        </div>
      </div>
    </form>
  );
}

function ComposerActionButton({ value, isRunning, isEditingQueue, onAbort }: { value: string; isRunning: boolean; isEditingQueue: boolean; onAbort?: () => void }) {
  if (isRunning && !value.trim()) {
    return <Button type="button" variant="destructive" size="icon-sm" disabled={!onAbort} className="size-7 rounded-full" aria-label="中止任务" title="中止任务" onClick={() => onAbort?.()}>
      <Square className="size-3.5 fill-current" />
    </Button>;
  }

  const label = isEditingQueue ? "保存队列任务" : isRunning ? "加入后续队列" : "发送任务";
  return <Button type="submit" variant="default" size="icon-sm" disabled={!value.trim()} className="size-7 rounded-full bg-[var(--composer-submit-bg)] text-[var(--composer-submit-text)] shadow-none hover:bg-[var(--composer-submit-bg-hover)] active:bg-[var(--composer-submit-bg-hover)]" aria-label={label} title={label}>
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
    <DropdownMenuContent align="start" sideOffset={6} className="w-[310px] rounded-[var(--radius-md)] border-[var(--border-default)] bg-[var(--bg-surface-raised)] p-1.5 text-[var(--text-primary)] shadow-[var(--shadow-popover)]">
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
    <DropdownMenuContent align="start" sideOffset={6} className="w-[260px] rounded-[var(--radius-md)] border-[var(--border-default)] bg-[var(--bg-surface-raised)] p-1.5 text-[var(--text-primary)] shadow-[var(--shadow-popover)]">
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
