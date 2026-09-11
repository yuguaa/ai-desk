import { useCallback, useEffect, useState } from "react";
import { installPiPackage, listPiPackages, removePiPackage, type PiPackageSummary } from "@/lib/pi-bridge";

/**
 * 管理全局 Pi 插件的加载、安装与卸载。
 * 项目级插件由后端支持，但前端当前只暴露全局作用域。
 */
export function usePiPackages() {
  const [packages, setPackages] = useState<PiPackageSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [removingSource, setRemovingSource] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    return listPiPackages()
      .then((items) => setPackages(items.filter((item) => item.scope === "global")))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const install = useCallback((source: string) => {
    const trimmed = source.trim();
    if (!trimmed) return Promise.resolve(false);
    setInstalling(true);
    setError(null);
    return installPiPackage(trimmed)
      .then(() => refresh().then(() => true))
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason));
        return false;
      })
      .finally(() => setInstalling(false));
  }, [refresh]);

  const remove = useCallback((source: string) => {
    setRemovingSource(source);
    setError(null);
    return removePiPackage(source)
      .then(() => refresh().then(() => true))
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason));
        return false;
      })
      .finally(() => setRemovingSource(null));
  }, [refresh]);

  return { packages, loading, error, installing, removingSource, install, remove, refresh };
}
