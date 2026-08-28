import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyAppearance, applyTheme, DEFAULT_APP_SETTINGS, loadAppSettings, normalizeHexColor, resolveTheme, SETTINGS_STORAGE_KEY } from "@/lib/app-settings";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  const style = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal("window", {
    matchMedia: vi.fn(() => ({ matches: false })),
  });
  vi.stubGlobal("document", {
    documentElement: {
      dataset: {},
      style: {
        setProperty: (key: string, value: string) => style.set(key, value),
        getPropertyValue: (key: string) => style.get(key) ?? "",
      },
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("app settings", () => {
  it("uses the branded default mascot state", () => {
    expect(loadAppSettings()).toEqual(DEFAULT_APP_SETTINGS);
    expect(DEFAULT_APP_SETTINGS.containerPadding).toBe(12);
    expect(DEFAULT_APP_SETTINGS.mascotEnabled).toBe(true);
  });

  it("persists valid appearance and mascot preferences while rejecting invalid values", () => {
    storage.set(SETTINGS_STORAGE_KEY, JSON.stringify({ theme: "light", accentColor: "custom", customAccentColor: "#abc", cornerRadius: 11, backgroundOpacity: 0.84, fontFamily: "geist", fontSize: 14.5, containerPadding: 16, mascotEnabled: true, mascotStyle: "mature", mascotMotion: false }));
    expect(loadAppSettings()).toMatchObject({ theme: "light", accentColor: "custom", customAccentColor: "#aabbcc", cornerRadius: 11, backgroundOpacity: 0.84, fontFamily: "geist", fontSize: 14.5, containerPadding: 16, mascotEnabled: true, mascotStyle: "mature", mascotMotion: false });

    storage.set(SETTINGS_STORAGE_KEY, JSON.stringify({ theme: "neon", accentColor: "missing", customAccentColor: "oops", cornerRadius: "round", backgroundOpacity: 4, fontFamily: "comic", fontSize: "large", containerPadding: "wide", mascotStyle: "missing", mascotEnabled: "yes" }));
    expect(loadAppSettings()).toEqual(DEFAULT_APP_SETTINGS);
  });

  it("clamps loaded container padding to the supported range", () => {
    storage.set(SETTINGS_STORAGE_KEY, JSON.stringify({ containerPadding: 4 }));
    expect(loadAppSettings().containerPadding).toBe(8);

    storage.set(SETTINGS_STORAGE_KEY, JSON.stringify({ containerPadding: 24 }));
    expect(loadAppSettings().containerPadding).toBe(20);

    storage.set(SETTINGS_STORAGE_KEY, JSON.stringify({ containerPadding: 12.5 }));
    expect(loadAppSettings().containerPadding).toBe(13);
  });

  it("resolves and applies the selected theme", () => {
    expect(resolveTheme("dark")).toBe("dark");
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("system")).toBe("light");
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("applies accent, radius, container padding, and background opacity tokens", () => {
    applyAppearance({ ...DEFAULT_APP_SETTINGS, theme: "light", accentColor: "custom", customAccentColor: "#123456", cornerRadius: 10, backgroundOpacity: 0.82, fontFamily: "mono", fontSize: 15, containerPadding: 14 });

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.accent).toBe("custom");
    expect(document.documentElement.style.getPropertyValue("--accent-rgb")).toBe("18 52 86");
    expect(document.documentElement.style.getPropertyValue("--radius-md")).toBe("10px");
    expect(document.documentElement.style.getPropertyValue("--radius-composer")).toBe("15px");
    expect(document.documentElement.style.getPropertyValue("--background-opacity")).toBe("0.82");
    expect(document.documentElement.dataset.font).toBe("mono");
    expect(document.documentElement.style.getPropertyValue("--font-size-offset")).toBe("2px");
    expect(document.documentElement.style.getPropertyValue("--container-padding")).toBe("14px");

    applyAppearance({ ...DEFAULT_APP_SETTINGS, containerPadding: 8 });
    expect(document.documentElement.style.getPropertyValue("--container-padding")).toBe("8px");
  });

  it("normalizes supported hex color formats", () => {
    expect(normalizeHexColor("abc")).toBe("#aabbcc");
    expect(normalizeHexColor("#12ABef")).toBe("#12abef");
    expect(normalizeHexColor("nope")).toBeNull();
  });
});
