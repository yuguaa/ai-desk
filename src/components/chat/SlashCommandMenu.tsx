import { Button } from "@/components/ui/button";
import { Lightbulb, Sparkles, Terminal, Wrench } from "@/components/ui/icons";
import { SLASH_COMMAND_SOURCE_LABELS, type SlashCommand, type SlashCommandSource } from "@/lib/slash-commands";

/* 斜杠命令提示菜单：输入 / 时浮现在输入框上方，展示 pi 能力并支持键盘与鼠标选择。 */
export function SlashCommandMenu({ commands, activeIndex, onSelect, onHover }: {
  commands: SlashCommand[];
  activeIndex: number;
  onSelect: (command: SlashCommand) => void;
  onHover?: (index: number) => void;
}) {
  return <div data-slot="slash-command-menu" role="listbox" aria-label="斜杠命令" className="absolute inset-x-3 bottom-full z-20 mb-1.5 max-h-64 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-popover)] p-1.5 text-[var(--text-primary)] shadow-[var(--shadow-popover)]">
    <div className="flex items-center gap-1.5 px-2 py-1 text-[var(--font-size-10-5)] font-medium text-[var(--text-tertiary)]"><Sparkles size={12} />斜杠命令</div>
    {commands.length ? commands.map((command, index) => (
      <Button
        key={command.name}
        type="button"
        variant="ghost"
        role="option"
        tabIndex={-1}
        aria-selected={index === activeIndex ? "true" : "false"}
        data-active={index === activeIndex ? "true" : "false"}
        className="h-auto w-full justify-start gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left data-[active=true]:bg-[var(--accent-tint-soft)]"
        onMouseEnter={() => onHover?.(index)}
        onMouseDown={(event) => {
          /* mousedown 抢先于编辑器失焦，避免点击无法送达。 */
          event.preventDefault();
          onSelect(command);
        }}
      >
        <SlashCommandSourceIcon source={command.source} />
        <span className="min-w-0 flex-1">
          <span className="block truncate">
            <span className="font-medium text-[var(--font-size-11-5)] text-[var(--text-primary)]">/{command.name}</span>
            {command.argumentHint && <span className="ml-1 font-mono text-[var(--font-size-10-5)] text-[var(--text-tertiary)]">{command.argumentHint}</span>}
          </span>
          {command.description && <span className="block truncate text-[var(--font-size-10-5)] text-[var(--text-secondary)]">{command.description}</span>}
        </span>
        <span className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] px-1.5 py-0.5 text-[var(--font-size-9-5)] text-[var(--text-tertiary)]">{SLASH_COMMAND_SOURCE_LABELS[command.source]}</span>
      </Button>
    )) : <div className="px-2 py-1.5 text-[var(--font-size-11)] text-[var(--text-tertiary)]">没有匹配的命令</div>}
  </div>;
}

function SlashCommandSourceIcon({ source }: { source: SlashCommandSource }) {
  if (source === "extension") return <Wrench size={13} className="shrink-0 text-[var(--accent)]" />;
  if (source === "skill") return <Lightbulb size={13} className="shrink-0 text-[var(--accent)]" />;
  if (source === "prompt") return <Sparkles size={13} className="shrink-0 text-[var(--accent)]" />;
  return <Terminal size={13} className="shrink-0 text-[var(--text-tertiary)]" />;
}
