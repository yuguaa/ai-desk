import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isMacTauriRuntime } from "@/lib/pi-bridge";

export function AppTopbar() {
  const immersive = isMacTauriRuntime();
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!immersive) return;
    const appWindow = getCurrentWindow();
    let disposed = false;
    let revision = 0;
    let unlisten: (() => void) | undefined;
    const syncFullscreen = () => {
      const currentRevision = ++revision;
      return appWindow.isFullscreen().then((value) => {
        if (!disposed && currentRevision === revision) setFullscreen(value);
      });
    };

    /* 先订阅再读取，避免挂载期间漏掉全屏切换。 */
    appWindow.onResized(syncFullscreen).then((stop) => {
      if (disposed) return stop();
      unlisten = stop;
      return syncFullscreen();
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [immersive]);

  if (immersive && fullscreen) return null;

  return (
    <header data-tauri-drag-region="deep" data-immersive={immersive ? "true" : "false"} className="app-titlebar relative flex h-10 shrink-0 select-none items-center bg-[var(--bg-titlebar)] px-[var(--container-padding)] data-[immersive=true]:h-[52px] data-[immersive=true]:pl-[76px]">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="font-mono text-[var(--font-size-11)] font-semibold leading-none text-[var(--text-secondary)]">AI DESK</span>
      </div>
    </header>
  );
}
