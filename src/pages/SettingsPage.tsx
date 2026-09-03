import { useEffect, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { ArrowLeft, Check, Download, LoaderCircle, Monitor, Moon, RefreshCw, RotateCcw, Settings, Sun, TriangleAlert } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { ColorInput } from "@/components/ui/color-input";
import { Input } from "@/components/ui/input";
import { InputNumber } from "@/components/ui/input-number";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RuntimeBadge } from "@/components/workspace/RuntimeBadge";
import { mascotImageFor, Mascot } from "@/components/mascot/Mascot";
import { checkForAppUpdate, installAppUpdate } from "@/lib/app-update";
import { type Update } from "@tauri-apps/plugin-updater";
import { ACCENT_OPTIONS, FONT_OPTIONS, MASCOT_OPTIONS, MASCOT_SOURCE_OPTIONS, normalizeHexColor, normalizeMascotImageUrl, THEME_OPTIONS, type AccentColor, type AppSettings, type FontFamilyPreference, type MascotSource, type ThemePreference } from "@/lib/app-settings";
import { isMacTauriRuntime } from "@/lib/pi-bridge";
import { cn } from "@/lib/utils";

const themeIcons: Record<ThemePreference, typeof Monitor> = { system: Monitor, dark: Moon, light: Sun };
type UpdateCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "latest"; latestVersion: string }
  | { status: "available"; latestVersion: string; update: Update }
  | { status: "installing"; latestVersion: string; progress: number | null }
  | { status: "error" };

export default function SettingsPage({ settings, isTauri, onBack, onUpdate, onReset }: { settings: AppSettings; isTauri: boolean; onBack: () => void; onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void; onReset: () => void }) {
  const [saved, setSaved] = useState(false);
  const [customHex, setCustomHex] = useState(settings.customAccentColor);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckState>({ status: "idle" });
  const immersive = isMacTauriRuntime();
  const customMascotUrl = normalizeMascotImageUrl(settings.mascotImageUrl);
  const invalidMascotUrl = settings.mascotImageUrl.length > 0 && !customMascotUrl;
  const visibleMascots = settings.mascotSource === "builtIn" ? MASCOT_OPTIONS : [];
  const activeMascotSource = MASCOT_SOURCE_OPTIONS.find((option) => option.value === settings.mascotSource) ?? MASCOT_SOURCE_OPTIONS[0];

  useEffect(() => setCustomHex(settings.customAccentColor), [settings.customAccentColor]);
  useEffect(() => {
    let active = true;
    if (!isTauri) return () => { active = false; };
    getVersion()
      .then((version) => { if (active) setCurrentVersion(version); })
      .catch(() => { if (active) setUpdateCheck({ status: "error" }); });
    return () => { active = false; };
  }, [isTauri]);

  const change = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    onUpdate(key, value);
    setSaved(false);
  };
  const saveIndicator = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  };

  const updateCustomHex = (value: string) => {
    setCustomHex(value);
    const normalized = normalizeHexColor(value);
    if (!normalized) return;
    change("customAccentColor", normalized);
    saveIndicator();
  };

  const updateMascotSource = (source: MascotSource) => {
    change("mascotSource", source);
    saveIndicator();
  };

  const checkUpdate = () => {
    if (!currentVersion || updateCheck.status === "checking") return;
    setUpdateCheck({ status: "checking" });
    checkForAppUpdate(currentVersion)
      .then((result) => setUpdateCheck(result.update
        ? { status: "available", latestVersion: result.latestVersion, update: result.update }
        : { status: "latest", latestVersion: result.latestVersion }))
      .catch(() => setUpdateCheck({ status: "error" }));
  };

  const installUpdate = () => {
    if (updateCheck.status !== "available") return;
    const { latestVersion, update } = updateCheck;
    let totalBytes: number | null = null;
    let downloadedBytes = 0;
    setUpdateCheck({ status: "installing", latestVersion, progress: null });
    installAppUpdate(update, (event) => {
      if (event.event === "Started") {
        totalBytes = event.data.contentLength ?? null;
        setUpdateCheck({ status: "installing", latestVersion, progress: totalBytes === null ? null : 0 });
      } else if (event.event === "Progress") {
        downloadedBytes += event.data.chunkLength;
        const progress = totalBytes === null
          ? null
          : Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
        setUpdateCheck({ status: "installing", latestVersion, progress });
      }
    }).catch(() => setUpdateCheck({ status: "error" }));
  };

  const updatePresentation = appUpdatePresentation(isTauri, currentVersion, updateCheck);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg-workspace)] text-[var(--text-primary)]">
      <header data-immersive={immersive ? "true" : "false"} className="app-titlebar relative flex h-10 shrink-0 select-none items-center bg-[var(--bg-titlebar)] data-[immersive=true]:h-[52px]">
        <div data-tauri-drag-region="deep" data-slot="titlebar-drag-region" className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1.5"><Settings size={14} className="text-[var(--text-tertiary)]" /><span className="text-[var(--font-size-12-5)] font-medium">设置</span></div>
        <div data-slot="settings-titlebar-actions" className="relative z-10 mx-auto flex w-full max-w-[760px] items-center justify-between px-[var(--container-padding-loose)]">
          <Button type="button" variant="ghost" size="icon-sm" onClick={onBack} aria-label="返回工作区" title="返回工作区"><ArrowLeft size={14} /></Button>
          <div className="flex items-center gap-2">
            <span className="hidden min-[460px]:inline-flex"><RuntimeBadge isTauri={isTauri} compact /></span>
            <Button type="button" variant="ghost" size="sm" onClick={() => { onReset(); saveIndicator(); }}><RotateCcw size={13} />恢复默认</Button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] px-[var(--container-padding-loose)] py-[var(--container-padding-loose)]">
          <div className="mb-4"><h1 className="text-[var(--font-size-15)] font-semibold text-[var(--text-primary)]">应用设置</h1><p className="mt-0.5 text-[var(--font-size-10-5)] text-[var(--text-tertiary)]">外观与本地偏好</p></div>

          <SettingsSection title="外观" description="调整会立即应用。">
            <SettingsGroup>
              <SettingRow label="主题" description="跟随系统或固定模式">
                <ToggleGroup type="single" value={settings.theme} onValueChange={(value) => { if (!value) return; change("theme", value as ThemePreference); saveIndicator(); }} className="grid w-full grid-cols-3 gap-0.5 rounded-[var(--radius-sm)] bg-[var(--bg-window)] p-0.5" spacing={2}>
                  {THEME_OPTIONS.map((option) => {
                    const Icon = themeIcons[option.value];
                    const active = settings.theme === option.value;
                    return <ToggleGroupItem type="button" key={option.value} value={option.value} aria-label={option.label} className="h-7 w-full gap-1.5 px-2 data-[state=on]:bg-[var(--accent-tint)]"><Icon size={12} className={active ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]"} /><span className="truncate text-[var(--font-size-10-5)]">{option.label}</span></ToggleGroupItem>;
                  })}
                </ToggleGroup>
              </SettingRow>

              <SettingRow label="主题颜色" description="操作与选中状态">
                <ToggleGroup type="single" value={settings.accentColor} onValueChange={(value) => { if (!value) return; change("accentColor", value as AccentColor); saveIndicator(); }} className="flex w-full flex-wrap justify-end gap-1" spacing={4}>
                  {ACCENT_OPTIONS.map((option) => {
                    const color = option.value === "custom" ? settings.customAccentColor : option.dark;
                    return <ToggleGroupItem key={option.value} value={option.value} aria-label={option.label} title={option.label} className="size-7 min-w-7 rounded-[var(--radius-sm)] border border-transparent p-0 data-[state=on]:border-[var(--accent-border)] data-[state=on]:bg-[var(--accent-tint)]"><span className="size-3.5 rounded-full shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.2),0_1px_2px_rgb(0_0_0_/_0.18)]" style={{ backgroundColor: color }} /></ToggleGroupItem>;
                  })}
                </ToggleGroup>
                {settings.accentColor === "custom" && <div className="mt-2 flex items-center justify-end gap-1.5"><ColorInput aria-label="选择自定义主题颜色" value={settings.customAccentColor} onChange={(event) => updateCustomHex(event.currentTarget.value)} /><Input aria-label="自定义主题颜色十六进制值" value={customHex} onChange={(event) => updateCustomHex(event.currentTarget.value)} maxLength={7} spellCheck={false} className="w-24 font-mono text-[var(--font-size-11)]" placeholder="#5b91f5" /></div>}
              </SettingRow>

              <SettingRow label="界面字体" description="全局字体">
                <Select value={settings.fontFamily} onValueChange={(value) => { change("fontFamily", value as FontFamilyPreference); saveIndicator(); }}>
                  <SelectTrigger aria-label="界面字体" className="ml-auto w-36"><SelectValue /></SelectTrigger>
                  <SelectContent align="end">
                    {FONT_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}><span style={{ fontFamily: fontPreviewFamily(option.value) }}>{option.label}</span></SelectItem>)}
                  </SelectContent>
                </Select>
              </SettingRow>

              <NumberSetting label="字体大小" description="只调整文字，不改变按钮和面板的固定尺寸。" value={settings.fontSize} min={11} max={16} step={0.5} onChange={(value) => { change("fontSize", value); saveIndicator(); }} />
              <NumberSetting label="容器内边距" description="统一调整页面、面板和内容区域的留白。" value={settings.containerPadding} min={8} max={20} step={1} onChange={(value) => { change("containerPadding", value); saveIndicator(); }} />
              <NumberSetting label="统一圆角" description="同时调整按钮、输入框、面板和弹层的圆角尺度。" value={settings.cornerRadius} min={0} max={14} step={1} onChange={(value) => { change("cornerRadius", value); saveIndicator(); }} />
              <NumberSetting label="背景透明度" description="调整窗口与内容面板透明度；菜单和弹窗保留可读性。" value={settings.backgroundOpacity} min={0.2} max={1} step={0.01} scale={100} onChange={(value) => { change("backgroundOpacity", value); saveIndicator(); }} />
            </SettingsGroup>
          </SettingsSection>

          <SettingsSection title="看板娘" description="会话背景角色。">
            <SettingsGroup>
              <SettingRow label="显示看板娘" description="在会话背景显示当前角色"><Switch aria-label="显示看板娘" checked={settings.mascotEnabled} onCheckedChange={(value) => { change("mascotEnabled", value); saveIndicator(); }} /></SettingRow>
              <SettingRow label="动画" description="启用轻微的呼吸动作"><Switch aria-label="动画" checked={settings.mascotMotion} onCheckedChange={(value) => { change("mascotMotion", value); saveIndicator(); }} /></SettingRow>
              <SettingRow label="图片源" description={activeMascotSource.description}>
                <ToggleGroup type="single" value={settings.mascotSource} onValueChange={(value) => { if (!value) return; updateMascotSource(value as MascotSource); }} className="grid w-full grid-cols-2 gap-0.5 rounded-[var(--radius-sm)] bg-[var(--bg-window)] p-0.5" spacing={2}>
                  {MASCOT_SOURCE_OPTIONS.map((option) => <ToggleGroupItem type="button" key={option.value} value={option.value} aria-label={option.label} title={option.description} className="h-7 w-full px-2 text-[var(--font-size-10)] data-[state=on]:bg-[var(--accent-tint)]">{option.label}</ToggleGroupItem>)}
                </ToggleGroup>
              </SettingRow>
              {settings.mascotSource === "customUrl" && <SettingRow label="图片地址" description={invalidMascotUrl ? "请输入有效的 HTTPS 图片地址" : "支持静态图片和直接返回图片的接口"}><Input aria-label="看板娘图片地址" aria-invalid={invalidMascotUrl} value={settings.mascotImageUrl} onChange={(event) => change("mascotImageUrl", event.currentTarget.value)} onBlur={saveIndicator} placeholder="https://example.com/mascot.png" spellCheck={false} className="w-full font-mono text-[var(--font-size-10)]" /></SettingRow>}
            </SettingsGroup>
            <div className="mt-3 grid gap-3">
              <div className="relative flex aspect-video w-full items-center justify-end overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-window)]">
                <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-3 py-2 text-[var(--font-size-10)] text-[var(--text-tertiary)]"><span>当前角色</span><span className={settings.mascotEnabled ? "text-[var(--success)]" : "text-[var(--text-tertiary)]"}>{settings.mascotEnabled ? "显示" : "关闭"}</span></div>
                <Mascot style={settings.mascotStyle} source={settings.mascotSource} customUrl={settings.mascotImageUrl} motion={settings.mascotMotion} className={cn("h-full w-full object-contain object-right transition-opacity", !settings.mascotEnabled && "opacity-45")} />
                {settings.mascotSource === "customUrl" && !customMascotUrl && <span className="absolute inset-x-3 bottom-16 text-center text-[var(--font-size-10)] text-[var(--text-tertiary)]">等待有效的 HTTPS 图片地址</span>}
              </div>
              {visibleMascots.length > 0 && <ToggleGroup type="single" value={settings.mascotStyle} onValueChange={(value) => { if (!value) return; change("mascotStyle", value as AppSettings["mascotStyle"]); saveIndicator(); }} className="grid w-full grid-cols-3 gap-1.5" spacing={6}>
                {visibleMascots.map((option) => <MascotOption key={option.value} option={option} active={settings.mascotStyle === option.value} />)}
              </ToggleGroup>}
            </div>
          </SettingsSection>

          <SettingsSection title="运行" description="本应用通过 Tauri 原生窗口连接本机 Pi。">
            <SettingsGroup>
              <SettingRow label="运行时" description="每个对话拥有独立的 Pi 进程，可同时运行"><RuntimeBadge isTauri={isTauri} compact /></SettingRow>
              <SettingRow label="配置存储" description="外观与看板娘偏好保存在本机应用存储"><span className="font-mono text-[var(--font-size-10)] text-[var(--text-tertiary)]">local</span></SettingRow>
              <SettingRow label="应用版本" description="手动检查 GitHub 已发布版本">
                <div className="flex w-full flex-col items-end gap-1">
                  <div className="flex items-center justify-end gap-2">
                    <span data-slot="current-app-version" className="min-w-16 text-right font-mono text-[var(--font-size-10-5)] tabular-nums text-[var(--text-secondary)]">{currentVersion ? `v${currentVersion}` : "—"}</span>
                    <Button type="button" variant="outline" size="sm" aria-label="检查应用更新" className="w-24" disabled={!isTauri || !currentVersion || updateCheck.status === "checking" || updateCheck.status === "installing"} onClick={checkUpdate}>
                      {updateCheck.status === "checking" ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                      {updateCheck.status === "checking" ? "检查中" : "检查更新"}
                    </Button>
                  </div>
                  {updateCheck.status === "available" && (
                    <Button type="button" variant="default" size="sm" aria-label="立即更新应用" className="w-24" onClick={installUpdate}>
                      <Download size={13} />立即更新
                    </Button>
                  )}
                  <div role="status" aria-live="polite" className={cn("flex min-h-4 items-center gap-1 text-right text-[var(--font-size-9-5)]", updatePresentation.tone)}>
                    {updateCheck.status === "latest" && <Check size={11} />}
                    {updateCheck.status === "available" && <RefreshCw size={11} />}
                    {updateCheck.status === "installing" && <LoaderCircle size={11} className="animate-spin" />}
                    {updateCheck.status === "error" && <TriangleAlert size={11} />}
                    <span>{updatePresentation.message}</span>
                  </div>
                </div>
              </SettingRow>
            </SettingsGroup>
          </SettingsSection>
          {saved && <div role="status" aria-live="polite" className="mt-4 flex items-center gap-2 text-[var(--font-size-11)] text-[var(--success)]"><Check size={13} />设置已更新</div>}
        </div>
      </div>
    </div>
  );
}

function appUpdatePresentation(isTauri: boolean, currentVersion: string | null, state: UpdateCheckState) {
  if (!isTauri) return { message: "仅桌面安装版支持检测更新", tone: "text-[var(--text-tertiary)]" };
  if (!currentVersion) return state.status === "error"
    ? { message: "无法读取当前应用版本", tone: "text-[var(--error)]" }
    : { message: "正在读取当前版本…", tone: "text-[var(--text-tertiary)]" };

  switch (state.status) {
    case "checking":
      return { message: "正在检查更新…", tone: "text-[var(--text-tertiary)]" };
    case "available":
      return { message: `发现新版本 v${state.latestVersion}`, tone: "text-[var(--accent)]" };
    case "installing":
      return { message: state.progress === null ? "正在安装更新…" : `正在下载更新 ${state.progress}%`, tone: "text-[var(--accent)]" };
    case "latest":
      return { message: `当前已是最新版本（v${state.latestVersion}）`, tone: "text-[var(--success)]" };
    case "error":
      return { message: "检查更新失败，请稍后重试", tone: "text-[var(--error)]" };
    default:
      return { message: "点击按钮检查已发布版本", tone: "text-[var(--text-tertiary)]" };
  }
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="border-t border-[var(--border-subtle)] py-[var(--container-padding-loose)]"><div className="mb-2.5 flex items-baseline gap-2"><h2 className="text-[var(--font-size-12)] font-semibold">{title}</h2><p className="text-[var(--font-size-10)] text-[var(--text-tertiary)]">{description}</p></div>{children}</section>;
}

function SettingsGroup({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] divide-y divide-[var(--border-subtle)]">{children}</div>;
}

function NumberSetting({ label, description, value, min, max, step, scale = 1, onChange }: { label: string; description: string; value: number; min: number; max: number; step: number; scale?: number; onChange: (value: number) => void }) {
  return <SettingRow label={label} description={description}><div className="flex justify-end"><InputNumber aria-label={label} value={value * scale} min={min * scale} max={max * scale} step={step * scale} onValueChange={(nextValue) => onChange(nextValue / scale)} /></div></SettingRow>;
}

function SettingRow({ label, description, children }: { label: string; description: string; children: ReactNode }) {
  return <div className="grid min-h-11 items-center gap-2 px-[var(--container-padding)] py-2 min-[620px]:grid-cols-[minmax(0,1fr)_minmax(250px,330px)]"><div className="min-w-0"><p className="text-[var(--font-size-11-5)] text-[var(--text-secondary)]">{label}</p><p className="mt-0.5 truncate text-[var(--font-size-9-5)] text-[var(--text-tertiary)]">{description}</p></div><div className="flex min-w-0 w-full justify-end justify-self-end">{children}</div></div>;
}

function MascotOption({ option, active }: { option: (typeof MASCOT_OPTIONS)[number]; active: boolean }) {
  return <ToggleGroupItem type="button" value={option.value} aria-label={`${option.label} ${option.description}`} title={option.description} className={cn("group flex min-h-[118px] w-full flex-col justify-between overflow-hidden rounded-[var(--radius-sm)] border p-0 text-left transition-[background-color,border-color] active:scale-[0.98]", active ? "border-[var(--accent-border)] bg-[var(--accent-tint)]" : "border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]")}><span className="flex h-[88px] w-full items-end justify-center overflow-hidden bg-[var(--bg-window)] px-1.5 pt-1.5"><img src={mascotImageFor(option.value) ?? ""} alt="" aria-hidden="true" loading="lazy" className="h-[94px] w-full object-contain object-bottom transition-transform duration-[var(--motion-base)] group-hover:scale-[1.025]" draggable="false" /></span><span className="flex h-7 w-full items-center gap-1 px-2"><span className="min-w-0 flex-1 truncate text-[var(--font-size-10)] text-[var(--text-primary)]">{option.label}</span>{active && <Check size={11} className="shrink-0 text-[var(--accent)]" />}</span></ToggleGroupItem>;
}

function fontPreviewFamily(font: FontFamilyPreference) {
  if (font === "geist") return '"Geist Variable", sans-serif';
  if (font === "mono") return 'ui-monospace, "SF Mono", monospace';
  return '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
}
