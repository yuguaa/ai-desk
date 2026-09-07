import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ImageAttachment } from "@/lib/image-attachments";

export type ScreenshotStatus = {
  supported: boolean;
  screenRecordingGranted: boolean;
  inputMonitoringGranted: boolean;
  shortcutEnabled: boolean;
};

export function screenshotError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error));
}

export const getScreenshotStatus = () => invoke<ScreenshotStatus>("get_screenshot_status");
export const requestScreenshotPermission = (permission: "screenRecording" | "inputMonitoring") => invoke<ScreenshotStatus>("request_screenshot_permission", { permission });
export const setScreenshotShortcutEnabled = (enabled: boolean) => invoke<ScreenshotStatus>("set_screenshot_shortcut_enabled", { enabled });
export const captureScreenshot = (): Promise<ImageAttachment[]> => invoke<Omit<ImageAttachment, "id">>("capture_frontmost_window")
  .then((image) => [{ ...image, id: crypto.randomUUID() }])
  .catch((error: unknown) => { throw screenshotError(error); });
export const listenScreenshotRequested = (handler: () => void) => listen("screenshot-requested", handler);
export const listenScreenshotError = (handler: (message: string) => void) => listen("screenshot-error", (event) => handler(screenshotError(event.payload).message));
