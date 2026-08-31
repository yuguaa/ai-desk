import { useCallback, useEffect, useRef } from "react";

const FOLLOW_OUTPUT_THRESHOLD = 24;

/**
 * 跟随最新输出滚动。
 * reverse 为 true 时由 flex-col-reverse 原生锚定最新内容，不再命令式写入 scrollTop。
 */
export function useFollowLatestOutput<T extends HTMLElement>(content: unknown, enabled = true, reverse = false) {
  const containerRef = useRef<T>(null);
  const isFollowingLatestRef = useRef(true);

  useEffect(() => {
    if (!enabled) {
      isFollowingLatestRef.current = true;
      return;
    }
    if (reverse) return;
    const container = containerRef.current;
    if (isFollowingLatestRef.current && container) container.scrollTop = container.scrollHeight;
  }, [content, enabled, reverse]);

  const updateFollowState = useCallback((container: T) => {
    if (reverse) return;
    isFollowingLatestRef.current = container.scrollHeight - container.scrollTop - container.clientHeight <= FOLLOW_OUTPUT_THRESHOLD;
  }, [reverse]);

  return { containerRef, updateFollowState };
}
