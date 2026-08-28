import { lazy, Suspense, useState } from "react";
import WorkspacePage from "@/pages/WorkspacePage";
import { useAppSettings } from "@/hooks/use-app-settings";
import { isTauriRuntime } from "@/lib/pi-bridge";

const SettingsPage = lazy(() => import("@/pages/SettingsPage"));

export default function App() {
  const [view, setView] = useState<"workspace" | "settings">("workspace");
  const appSettings = useAppSettings();
  const isTauri = isTauriRuntime();
  if (view === "settings") return <Suspense fallback={<div className="h-screen bg-[var(--bg-workspace)]" aria-busy="true" />}><SettingsPage settings={appSettings.settings} isTauri={isTauri} onBack={() => setView("workspace")} onUpdate={appSettings.updateSettings} onReset={appSettings.resetSettings} /></Suspense>;
  return <WorkspacePage settings={appSettings.settings} onOpenSettings={() => setView("settings")} />;
}
