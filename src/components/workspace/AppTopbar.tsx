import { isMacTauriRuntime } from "@/lib/pi-bridge";

export function AppTopbar() {
  const immersive = isMacTauriRuntime();
  return (
    <header data-tauri-drag-region="deep" data-immersive={immersive ? "true" : "false"} className="app-titlebar relative flex h-10 shrink-0 select-none items-center bg-[var(--bg-titlebar)] px-[var(--container-padding)] data-[immersive=true]:h-[52px] data-[immersive=true]:pl-[76px]">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="font-mono text-[var(--font-size-11)] font-semibold leading-none text-[var(--text-secondary)]">AI DESK</span>
      </div>
    </header>
  );
}
