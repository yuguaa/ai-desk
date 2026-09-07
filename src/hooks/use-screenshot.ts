import { useCallback, useEffect, useRef } from "react";
import type { useImageDrafts } from "@/hooks/use-image-drafts";
import { isMacTauriRuntime } from "@/lib/pi-bridge";
import { captureScreenshot, listenScreenshotError, listenScreenshotRequested, screenshotError } from "@/lib/screenshot-bridge";

export function useScreenshot(draft: ReturnType<typeof useImageDrafts>, canCapture: boolean, onCaptured?: () => void) {
  const current = useRef({ draft, canCapture, onCaptured });
  current.current = { draft, canCapture, onCaptured };
  const capture = useCallback(() => {
    const target = current.current;
    if (!target.canCapture) {
      target.draft.setError("请先选择项目，再截取窗口");
      target.onCaptured?.();
      return;
    }
    /* load 在触发时绑定草稿；截图完成前不激活窗口，以免截到客户端自身。 */
    void target.draft.load(captureScreenshot).then(() => target.onCaptured?.());
  }, []);

  useEffect(() => {
    if (!isMacTauriRuntime()) return;
    let disposed = false;
    const cleanups: (() => void)[] = [];
    const register = (subscription: Promise<() => void>) => subscription.then((cleanup) => {
      if (disposed) cleanup();
      else cleanups.push(cleanup);
    }).catch((error: unknown) => {
      if (!disposed) current.current.draft.setError(screenshotError(error).message);
    });
    void register(listenScreenshotRequested(capture));
    void register(listenScreenshotError((message) => current.current.draft.setError(message)));
    return () => { disposed = true; cleanups.forEach((cleanup) => cleanup()); };
  }, [capture]);

  return isMacTauriRuntime() ? capture : undefined;
}
