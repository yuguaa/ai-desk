import { describe, expect, it } from "vitest";
import {
  BUILTIN_SLASH_COMMANDS,
  combineSlashCommands,
  filterSlashCommands,
  normalizeSlashCommand,
  parseLocalSlashCommand,
  slashCommandText,
  SLASH_COMMAND_SOURCE_LABELS,
} from "@/lib/slash-commands";

describe("slash commands 数据层", () => {
  it("内置命令包含 GUI 本地可执行的 pi 能力", () => {
    expect(BUILTIN_SLASH_COMMANDS.map((command) => command.name)).toEqual(["new", "name", "compact", "copy"]);
    expect(BUILTIN_SLASH_COMMANDS.every((command) => command.description && command.source === "builtin")).toBe(true);
    expect(SLASH_COMMAND_SOURCE_LABELS).toMatchObject({ builtin: "内置", extension: "扩展", skill: "技能", prompt: "模板" });
  });

  it("normalizeSlashCommand 归一化 RPC 命令并拒绝非法值", () => {
    expect(normalizeSlashCommand({ name: "goal", description: "长跑目标", source: "extension" })).toEqual({ name: "goal", description: "长跑目标", source: "extension" });
    expect(normalizeSlashCommand({ name: "skill:vue" })).toEqual({ name: "skill:vue", description: "", source: "extension" });
    expect(normalizeSlashCommand({ name: "", source: "skill" })).toBeNull();
    expect(normalizeSlashCommand({ name: "bad name" })).toBeNull();
    expect(normalizeSlashCommand(null)).toBeNull();
    expect(normalizeSlashCommand("goal")).toBeNull();
  });

  it("combineSlashCommands 内置优先并去重动态命令", () => {
    const combined = combineSlashCommands([
      { name: "goal", description: "目标", source: "extension" },
      { name: "new", description: "重复的内置名", source: "extension" },
      { name: "skill:vue", description: "Vue", source: "skill" },
    ]);
    expect(combined.map((command) => command.name)).toEqual(["new", "name", "compact", "copy", "goal", "skill:vue"]);
    expect(combined.find((command) => command.name === "new")?.source).toBe("builtin");
  });

  it("filterSlashCommands 按查询词过滤且前缀匹配优先", () => {
    const commands = combineSlashCommands([
      { name: "goal", description: "目标", source: "extension" },
      { name: "go-check", description: "检查", source: "skill" },
    ]);
    expect(filterSlashCommands(commands, "").map((command) => command.name)).toEqual(["new", "name", "compact", "copy", "goal", "go-check"]);
    expect(filterSlashCommands(commands, "go").map((command) => command.name)).toEqual(["goal", "go-check"]);
    expect(filterSlashCommands(commands, "copy").map((command) => command.name)).toEqual(["copy"]);
    expect(filterSlashCommands(commands, "missing")).toEqual([]);
  });

  it("parseLocalSlashCommand 识别本地命令并解析参数", () => {
    expect(parseLocalSlashCommand("/new")).toEqual({ name: "new", args: "" });
    expect(parseLocalSlashCommand("/name 修复滚动问题")).toEqual({ name: "name", args: "修复滚动问题" });
    expect(parseLocalSlashCommand("/compact 保留架构决策")).toEqual({ name: "compact", args: "保留架构决策" });
    expect(parseLocalSlashCommand("/copy")).toEqual({ name: "copy", args: "" });
    expect(parseLocalSlashCommand("/name")).toEqual({ name: "name", args: "" });
    expect(parseLocalSlashCommand("/goal 完善插件")).toBeNull();
    expect(parseLocalSlashCommand("普通文本")).toBeNull();
    expect(parseLocalSlashCommand("")).toBeNull();
  });

  it("new/copy 带参数时不拦截，与 pi TUI 精确匹配语义一致", () => {
    expect(parseLocalSlashCommand("/new 请继续上次话题")).toBeNull();
    expect(parseLocalSlashCommand("/copy 昨天那条回复")).toBeNull();
  });

  it("slashCommandText 为需要参数的命令补尾随空格", () => {
    expect(slashCommandText(BUILTIN_SLASH_COMMANDS[0])).toBe("/new");
    expect(slashCommandText(BUILTIN_SLASH_COMMANDS[1])).toBe("/name ");
    expect(slashCommandText({ name: "goal", description: "", source: "extension" })).toBe("/goal ");
  });
});
