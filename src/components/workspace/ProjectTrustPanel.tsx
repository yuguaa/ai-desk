import { Button } from "@/components/ui/button";
import { FolderOpen, TriangleAlert } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export function ProjectTrustPanel({ projectName, projectPath, trusted, onTrustedChange, disabled = false, className }: { projectName: string; projectPath: string; trusted: boolean; onTrustedChange?: (trusted: boolean) => void; disabled?: boolean; className?: string }) {
  if (trusted) return null;

  return <section className={cn("border-b border-[var(--border-subtle)] bg-[var(--bg-workspace)] px-[var(--container-padding-loose)] py-[var(--container-padding)]", className)} aria-label="项目资源信任设置">
    <div className="mx-auto max-w-4xl rounded-[var(--radius-lg)] bg-[var(--bg-surface)] px-[var(--container-padding)] py-[var(--container-padding)] shadow-[inset_0_0_0_1px_var(--border-default),var(--shadow-sm)]">
      <div className="flex items-start gap-3">
        <div className="relative mt-0.5 grid size-8 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--warning-tint)] text-[var(--warning)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--warning)_24%,transparent)]">
          <FolderOpen className="size-4" />
          <TriangleAlert className="absolute -bottom-1 -right-1 size-3.5 rounded-full bg-[var(--bg-surface)] text-[var(--warning)]" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[var(--font-size-12-5)] font-medium text-[var(--text-primary)]">信任此项目？</h2>
          <p className="mt-1 text-[var(--font-size-11)] leading-5 text-[var(--text-secondary)]">
            信任后会加载 <span className="font-medium text-[var(--text-primary)]">{projectName}</span> 内的 Pi resources、extensions 和 settings。请只信任来源明确的项目文件。
          </p>
          <p className="mt-1 truncate rounded-[var(--radius-sm)] bg-[var(--bg-window)] px-2 py-1 font-mono text-[var(--font-size-10)] text-[var(--text-tertiary)]" title={projectPath}>{projectPath}</p>
          <p className="mt-1.5 text-[var(--font-size-10)] leading-4 text-[var(--text-tertiary)]">项目信任不会限制 Agent 的文件访问或工具权限。</p>
        </div>
        <Button type="button" size="sm" disabled={disabled} className="mt-0.5" onClick={() => onTrustedChange?.(true)}>信任项目</Button>
      </div>
    </div>
  </section>;
}
