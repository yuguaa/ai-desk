import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { getScreenshotStatus, requestScreenshotPermission, screenshotError, setScreenshotShortcutEnabled, type ScreenshotStatus } from "@/lib/screenshot-bridge";

export function ScreenshotSettings() {
  const [status, setStatus] = useState<ScreenshotStatus | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    const refresh = () => getScreenshotStatus().then((value) => { if (!disposed) setStatus(value); })
      .catch((reason: unknown) => { if (!disposed) setError(screenshotError(reason).message); });
    void refresh();
    window.addEventListener("focus", refresh);
    return () => { disposed = true; window.removeEventListener("focus", refresh); };
  }, []);
  const updateStatus = (request: Promise<ScreenshotStatus>) => {
    setPending(true);
    setError(null);
    request.then(setStatus)
      .catch((reason: unknown) => setError(screenshotError(reason).message))
      .finally(() => setPending(false));
  };
  return <div className="flex flex-col gap-2 py-3">
    <div className="flex items-center justify-between gap-4">
      <span className="text-[var(--font-size-12)]">双 Command 截图</span>
      <Switch aria-label="双 Command 截图" checked={status?.shortcutEnabled ?? false} disabled={!status?.supported || pending} onCheckedChange={(enabled) => updateStatus(setScreenshotShortcutEnabled(enabled))} />
    </div>
    <p className="text-[var(--font-size-10)] text-[var(--text-tertiary)]">同时按下左右 Command，截取前台窗口并加入当前草稿。需要屏幕录制和输入监控权限，每次启动默认关闭。</p>
    {status?.supported && !status.screenRecordingGranted && <Button type="button" variant="outline" size="xs" disabled={pending} className="self-start" onClick={() => updateStatus(requestScreenshotPermission("screenRecording"))}>授权屏幕录制</Button>}
    {status && !status.supported && <p className="text-[var(--font-size-10)] text-[var(--text-tertiary)]">需要 macOS 14 或更高版本。</p>}
    {error && <p role="alert" className="text-[var(--font-size-10)] text-[var(--error)]">{error}</p>}
  </div>;
}
