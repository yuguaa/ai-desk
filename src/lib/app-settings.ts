export type ThemePreference = "system" | "dark" | "light";
export type AccentColor = "blue" | "purple" | "pink" | "red" | "orange" | "yellow" | "green" | "graphite" | "custom";
export type FontFamilyPreference = "system" | "geist" | "mono";
export type MascotSource = "builtIn" | "customUrl";

export const MASCOT_OPTIONS = [
  { value: "scarletPose", label: "绯红魅影", description: "性感姿态动漫图" },
  { value: "violetPose", label: "紫夜佳人", description: "紫色魅惑造型" },
  { value: "beachAnime", label: "沙滩丽人", description: "性感沙滩造型" },
  { value: "midnightPose", label: "午夜魅影", description: "暗色成熟造型" },
  { value: "silverPose", label: "银发魅姬", description: "银发性感姿态" },
  { value: "silverLounge", label: "银发闲憩", description: "银发沙发休憩造型" },
  { value: "glamourManga", label: "魅惑御姐", description: "成熟魅惑动漫人像" },
] as const;

export type MascotStyle = (typeof MASCOT_OPTIONS)[number]["value"];

export const MASCOT_SOURCE_OPTIONS: ReadonlyArray<{ value: MascotSource; label: string; description: string }> = [
  { value: "builtIn", label: "内置图库", description: "内置美女动漫图" },
  { value: "customUrl", label: "自定义 URL", description: "使用 HTTPS 图片地址或图片接口" },
];

export type AppSettings = {
  theme: ThemePreference;
  accentColor: AccentColor;
  customAccentColor: string;
  cornerRadius: number;
  backgroundOpacity: number;
  fontFamily: FontFamilyPreference;
  fontSize: number;
  containerPadding: number;
  mascotEnabled: boolean;
  mascotSource: MascotSource;
  mascotImageUrl: string;
  mascotStyle: MascotStyle;
  mascotMotion: boolean;
};

export const SETTINGS_STORAGE_KEY = "ai-desk.settings";

const MIN_POPOVER_OPACITY = 0.85;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: "dark",
  accentColor: "blue",
  customAccentColor: "#5b91f5",
  cornerRadius: 7,
  backgroundOpacity: 1,
  fontFamily: "system",
  fontSize: 13,
  containerPadding: 12,
  mascotEnabled: true,
  mascotSource: "builtIn",
  mascotImageUrl: "",
  mascotStyle: "scarletPose",
  mascotMotion: true,
};

export const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "跟随系统" },
  { value: "dark", label: "深色" },
  { value: "light", label: "浅色" },
];

export const ACCENT_OPTIONS: ReadonlyArray<{ value: AccentColor; label: string; dark: string; light: string }> = [
  { value: "blue", label: "蓝色", dark: "#5b91f5", light: "#2a6fe0" },
  { value: "purple", label: "紫色", dark: "#a78bfa", light: "#7c3aed" },
  { value: "pink", label: "粉色", dark: "#f472b6", light: "#db2777" },
  { value: "red", label: "红色", dark: "#f87171", light: "#dc2626" },
  { value: "orange", label: "橙色", dark: "#fb923c", light: "#ea580c" },
  { value: "yellow", label: "黄色", dark: "#eab308", light: "#ca8a04" },
  { value: "green", label: "绿色", dark: "#34d399", light: "#059669" },
  { value: "graphite", label: "石墨", dark: "#8a919e", light: "#5f6672" },
  { value: "custom", label: "自定义", dark: "#5b91f5", light: "#2a6fe0" },
];

export const FONT_OPTIONS: ReadonlyArray<{ value: FontFamilyPreference; label: string; sample: string }> = [
  { value: "system", label: "系统", sample: "系统界面" },
  { value: "geist", label: "Geist", sample: "Geist Sans" },
  { value: "mono", label: "等宽", sample: "Mono 13" },
];

export function loadAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_APP_SETTINGS;
    return normalizeAppSettings(JSON.parse(raw) as Partial<AppSettings>);
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export function normalizeAppSettings(settings: Partial<AppSettings>): AppSettings {
  const mascotSource = MASCOT_SOURCE_OPTIONS.some((option) => option.value === settings.mascotSource) ? settings.mascotSource as MascotSource : DEFAULT_APP_SETTINGS.mascotSource;

  return {
    ...DEFAULT_APP_SETTINGS,
    ...settings,
    theme: settings.theme === "light" || settings.theme === "system" || settings.theme === "dark" ? settings.theme : DEFAULT_APP_SETTINGS.theme,
    accentColor: ACCENT_OPTIONS.some((option) => option.value === settings.accentColor) ? settings.accentColor as AccentColor : DEFAULT_APP_SETTINGS.accentColor,
    customAccentColor: normalizeHexColor(settings.customAccentColor) ?? DEFAULT_APP_SETTINGS.customAccentColor,
    cornerRadius: normalizeNumber(settings.cornerRadius, 0, 14, DEFAULT_APP_SETTINGS.cornerRadius),
    backgroundOpacity: normalizeNumber(settings.backgroundOpacity, 0.2, 1, DEFAULT_APP_SETTINGS.backgroundOpacity),
    fontFamily: FONT_OPTIONS.some((option) => option.value === settings.fontFamily) ? settings.fontFamily as FontFamilyPreference : DEFAULT_APP_SETTINGS.fontFamily,
    fontSize: normalizeNumber(settings.fontSize, 11, 16, DEFAULT_APP_SETTINGS.fontSize),
    containerPadding: normalizeContainerPadding(settings.containerPadding),
    mascotStyle: MASCOT_OPTIONS.some((option) => option.value === settings.mascotStyle) ? settings.mascotStyle as MascotStyle : DEFAULT_APP_SETTINGS.mascotStyle,
    mascotEnabled: typeof settings.mascotEnabled === "boolean" ? settings.mascotEnabled : DEFAULT_APP_SETTINGS.mascotEnabled,
    mascotSource,
    mascotImageUrl: typeof settings.mascotImageUrl === "string" ? settings.mascotImageUrl.trim() : DEFAULT_APP_SETTINGS.mascotImageUrl,
    mascotMotion: typeof settings.mascotMotion === "boolean" ? settings.mascotMotion : DEFAULT_APP_SETTINGS.mascotMotion,
  };
}

export function normalizeMascotImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

export function resolveTheme(theme: ThemePreference): "dark" | "light" {
  if (theme !== "system") return theme;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: ThemePreference) {
  const resolved = resolveTheme(theme);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

export function applyAppearance(settings: AppSettings) {
  applyTheme(settings.theme);
  applyAccent(settings.accentColor, settings.customAccentColor, settings.theme);
  applyCornerRadius(settings.cornerRadius);
  applyTypography(settings.fontFamily, settings.fontSize);
  applyContainerPadding(settings.containerPadding);
  const root = document.documentElement;
  root.style.setProperty("--background-opacity", String(settings.backgroundOpacity));
  root.style.setProperty("--surface-opacity", String(settings.backgroundOpacity));
  root.style.setProperty("--popover-opacity", String(Math.max(settings.backgroundOpacity, MIN_POPOVER_OPACITY)));
}

export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().replace(/^#/, "");
  const expanded = raw.length === 3 ? raw.split("").map((character) => character + character).join("") : raw;
  return /^[0-9a-fA-F]{6}$/.test(expanded) ? `#${expanded.toLowerCase()}` : null;
}

function applyAccent(accent: AccentColor, customHex: string, theme: ThemePreference) {
  const resolved = resolveTheme(theme);
  const preset = ACCENT_OPTIONS.find((option) => option.value === accent) ?? ACCENT_OPTIONS[0];
  const color = accent === "custom" ? normalizeHexColor(customHex) ?? DEFAULT_APP_SETTINGS.customAccentColor : preset[resolved];
  const rgb = hexToRgb(color);
  const root = document.documentElement;
  root.dataset.accent = accent;
  root.style.setProperty("--accent-rgb", `${rgb.red} ${rgb.green} ${rgb.blue}`);
}

function applyCornerRadius(radius: number) {
  const root = document.documentElement;
  const value = normalizeNumber(radius, 0, 14, DEFAULT_APP_SETTINGS.cornerRadius);
  root.style.setProperty("--radius-xs", `${Math.max(0, value - 4)}px`);
  root.style.setProperty("--radius-sm", `${Math.max(0, value - 2)}px`);
  root.style.setProperty("--radius-md", `${value}px`);
  root.style.setProperty("--radius-lg", `${value + 2}px`);
  root.style.setProperty("--radius-composer", `${value + 5}px`);
}

function applyTypography(fontFamily: FontFamilyPreference, fontSize: number) {
  const root = document.documentElement;
  const families: Record<FontFamilyPreference, string> = {
    system: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "Geist Variable", system-ui, sans-serif',
    geist: '"Geist Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    mono: 'ui-monospace, "SF Mono", "Cascadia Mono", "Geist Mono", Menlo, monospace',
  };
  const size = normalizeNumber(fontSize, 11, 16, DEFAULT_APP_SETTINGS.fontSize);
  root.dataset.font = fontFamily;
  root.style.setProperty("--font-ui", families[fontFamily]);
  root.style.setProperty("--font-size-offset", `${size - DEFAULT_APP_SETTINGS.fontSize}px`);
}

function applyContainerPadding(containerPadding: number) {
  const root = document.documentElement;
  const value = normalizeContainerPadding(containerPadding);
  root.style.setProperty("--container-padding", `${value}px`);
}

function hexToRgb(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  return { red: (value >> 16) & 255, green: (value >> 8) & 255, blue: value & 255 };
}

function normalizeNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function normalizeContainerPadding(value: unknown) {
  return Math.round(normalizeNumber(value, 8, 20, DEFAULT_APP_SETTINGS.containerPadding));
}
