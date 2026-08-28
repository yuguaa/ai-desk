import { useEffect, useState } from "react";
import { applyAppearance, DEFAULT_APP_SETTINGS, loadAppSettings, normalizeAppSettings, SETTINGS_STORAGE_KEY, type AppSettings } from "@/lib/app-settings";

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => loadAppSettings());

  useEffect(() => {
    applyAppearance(settings);
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (settings.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyAppearance(settings);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [settings]);

  const updateSettings = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((current) => normalizeAppSettings({ ...current, [key]: value }));
  };

  const resetSettings = () => setSettings(DEFAULT_APP_SETTINGS);

  return { settings, updateSettings, resetSettings };
}
