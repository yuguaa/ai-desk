import { lazy, Suspense, useState } from "react";
import { Toaster } from "sonner";
import { Mascot } from "@/components/mascot/Mascot";
import WorkspacePage from "@/pages/WorkspacePage";
import { useAppUpdate } from "@/hooks/use-app-update";
import { useAppSettings } from "@/hooks/use-app-settings";
import { isTauriRuntime } from "@/lib/pi-bridge";

const SettingsPage = lazy(() => import("@/pages/SettingsPage"));

export default function App() {
  const [view, setView] = useState<"workspace" | "settings">("workspace");
  const appSettings = useAppSettings();
  const isTauri = isTauriRuntime();
  const appUpdate = useAppUpdate(isTauri);

  return <div data-slot="app-shell" className="relative isolate h-screen overflow-hidden bg-[var(--bg-window)]">
    <Mascot style={appSettings.settings.mascotStyle} source={appSettings.settings.mascotSource} customUrls={appSettings.settings.mascotImageUrls} customUrlIndex={appSettings.settings.mascotImageUrlIndex} enabled={appSettings.settings.mascotEnabled} motion={appSettings.settings.mascotMotion} className="mascot-global-background pointer-events-none absolute -inset-1 z-0 h-[calc(100%+8px)] w-[calc(100%+8px)] object-cover object-right" />
    <div className="relative z-10 h-full">
      {/* 设置仅遮蔽工作区，保留草稿、任务队列与运行事件订阅。 */}
      <div hidden={view !== "workspace"} className="h-full"><WorkspacePage onOpenSettings={() => setView("settings")} onShowWorkspace={() => setView("workspace")} /></div>
      {view === "settings" && <Suspense fallback={<div className="h-full bg-[var(--bg-workspace)]" aria-busy="true" />}><SettingsPage settings={appSettings.settings} appUpdate={appUpdate} isTauri={isTauri} onBack={() => setView("workspace")} onUpdate={appSettings.updateSettings} onReset={appSettings.resetSettings} /></Suspense>}
      <Toaster theme={appSettings.settings.theme} position="top-center" offset={{ top: 64 }} richColors />
    </div>
  </div>;
}
