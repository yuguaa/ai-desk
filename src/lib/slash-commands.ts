export type SlashCommandSource = "builtin" | "extension" | "skill" | "prompt";

export type SlashCommand = {
  /* 命令名（不含斜杠），skill 命令形如 skill:vue；argumentHint 仅内置命令使用（RPC 协议不返回该字段） */
  name: string;
  description: string;
  source: SlashCommandSource;
  argumentHint?: string;
};

export type LocalSlashCommand =
  | { name: "new"; args: string }
  | { name: "name"; args: string }
  | { name: "compact"; args: string }
  | { name: "copy"; args: string };

/* 内置命令：pi 的交互命令中 GUI 能执行的合理子集。
   排除依据：已有等价 UI（settings/model/resume/trust/quit）、无对应 RPC 无法执行
   （import/share/login/logout/reload/scoped-models/changelog/hotkeys/session）、
   需新增选择器 UI（tree/fork/clone/export）。扩展、技能与模板命令由 pi 进程动态提供。 */
export const BUILTIN_SLASH_COMMANDS: SlashCommand[] = [
  { name: "new", description: "开始新会话", source: "builtin" },
  { name: "name", description: "设置会话名称", source: "builtin", argumentHint: "<名称>" },
  { name: "compact", description: "压缩会话上下文", source: "builtin", argumentHint: "[指令]" },
  { name: "copy", description: "复制最后一条 AI 回复", source: "builtin" },
];

/* 命令来源展示文案 */
export const SLASH_COMMAND_SOURCE_LABELS: Record<SlashCommandSource, string> = {
  builtin: "内置",
  extension: "扩展",
  skill: "技能",
  prompt: "模板",
};

/* 归一化 pi RPC get_commands 返回的命令项 */
export function normalizeSlashCommand(value: unknown): SlashCommand | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const name = typeof item.name === "string" ? item.name.trim() : "";
  if (!name || /\s/.test(name)) return null;
  const source = item.source === "extension" || item.source === "skill" || item.source === "prompt" ? item.source : "extension";
  /* RPC 协议不返回 argumentHint，动态命令统一由菜单选择时补尾随空格。 */
  return {
    name,
    description: typeof item.description === "string" ? item.description : "",
    source,
  };
}

/* 合成菜单命令：内置命令优先，与内置同名的动态命令跳过（对齐 pi 的冲突处理） */
export function combineSlashCommands(dynamicCommands: SlashCommand[]): SlashCommand[] {
  const names = new Set(BUILTIN_SLASH_COMMANDS.map((command) => command.name));
  const uniqueDynamic = dynamicCommands.filter((command) => {
    if (names.has(command.name)) return false;
    names.add(command.name);
    return true;
  });
  return [...BUILTIN_SLASH_COMMANDS, ...uniqueDynamic];
}

/* 按斜杠后的输入片段过滤命令，前缀匹配优先 */
export function filterSlashCommands(commands: SlashCommand[], query: string): SlashCommand[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return commands;
  const matches = commands.filter((command) => command.name.toLowerCase().includes(normalized));
  return matches.sort((a, b) => Number(b.name.toLowerCase().startsWith(normalized)) - Number(a.name.toLowerCase().startsWith(normalized)));
}

/* 解析本地可执行的斜杠命令，非本地命令返回 null（交给 pi 进程处理）。
   new/copy 与 pi TUI 一致仅精确匹配，带参时放行给模型；name/compact 支持参数。 */
export function parseLocalSlashCommand(text: string): LocalSlashCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const spaceIndex = trimmed.search(/\s/);
  const name = spaceIndex < 0 ? trimmed : trimmed.slice(0, spaceIndex);
  const args = spaceIndex < 0 ? "" : trimmed.slice(spaceIndex + 1).trim();
  if (name === "/name" || name === "/compact") {
    return { name: name.slice(1) as LocalSlashCommand["name"], args };
  }
  if ((name === "/new" || name === "/copy") && !args) {
    return { name: name.slice(1) as LocalSlashCommand["name"], args };
  }
  return null;
}

/* 菜单选择后插入输入框的命令文本 */
export function slashCommandText(command: SlashCommand): string {
  return command.argumentHint || command.source !== "builtin" ? `/${command.name} ` : `/${command.name}`;
}
