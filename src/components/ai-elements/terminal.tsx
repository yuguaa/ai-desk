export function Terminal({ children }: { children: string }) {
  return <pre className="overflow-auto rounded-[var(--radius-lg)] bg-foreground px-3 py-3 font-mono text-[var(--font-size-12)] leading-5 text-primary-foreground/85">{children}</pre>;
}
