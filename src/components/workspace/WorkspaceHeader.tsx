import { memo } from "react";
import type { ConversationRecord, Project } from "@/types/workspace";

export const WorkspaceHeader = memo(function WorkspaceHeader({ project, conversation }: { project: Project; conversation?: ConversationRecord }) {
  return (
    <header className="flex h-9 shrink-0 items-center border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)] px-[var(--container-padding)]">
      <span className="min-w-0 truncate text-left text-[var(--font-size-11-5)] font-medium text-[var(--text-primary)]">
        {project.id ? conversation?.title ?? "新对话" : "选择目录开始"}
      </span>
    </header>
  );
});
