import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import iconSource from "@/components/ui/icons.tsx?raw";

const styleSource = readFileSync(new URL("../index.css", import.meta.url), "utf8");

const sourceFiles = import.meta.glob(["../components/**/*.{ts,tsx}", "../pages/**/*.{ts,tsx}", "../App.tsx"], {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

const majorLayoutPaddingTokens: Record<string, string[]> = {
  "../components/chat/ChatPanel.tsx": ["--container-padding", "--container-padding-tight", "--container-padding-loose"],
  "../components/extension/ExtensionUiPanel.tsx": ["--container-padding-tight", "--container-padding-loose"],
  "../components/files/DiffPreview.tsx": ["--container-padding-tight"],
  "../components/files/FileExplorer.tsx": ["--container-padding-tight"],
  "../components/files/FilePreview.tsx": ["--container-padding-tight"],
  "../components/git/GitPanel.tsx": ["--container-padding", "--container-padding-tight"],
  "../components/workspace/AppTopbar.tsx": ["--container-padding"],
  "../components/workspace/ProjectTrustPanel.tsx": ["--container-padding", "--container-padding-loose"],
  "../components/workspace/WorkspaceHeader.tsx": ["--container-padding"],
  "../components/workspace/WorkspaceInspector.tsx": ["--container-padding-tight"],
  "../components/workspace/WorkspaceSidebar.tsx": ["--container-padding-tight"],
  "../pages/SettingsPage.tsx": ["--container-padding", "--container-padding-loose"],
};

describe("UI primitive boundary", () => {
  it("keeps raw interactive elements inside components/ui", () => {
    const violations = businessSources().flatMap(([file, source]) => /<(?:button|select|input|textarea)\b/g.test(source) ? [file] : []);

    expect(violations).toEqual([]);
  });

  it("keeps UI primitive dependencies behind components/ui", () => {
    const violations = businessSources().flatMap(([file, source]) => /from\s+["'](?:radix-ui|@radix-ui\/[^"']+)["']/.test(source) ? [file] : []);

    expect(violations).toEqual([]);
  });

  it("uses tree-shakeable Lucide icons behind one contextual motion boundary", () => {
    const iconDependencyViolations = Object.entries(sourceFiles).flatMap(([file, source]) => {
      if (file.endsWith("/components/ui/icons.tsx")) return [];
      return /from\s+["'](?:lucide-react|react-icons(?:\/[^"']+)?|@heroicons\/[^"']+|@tabler\/icons-react|@phosphor-icons\/react|@fortawesome\/[^"']+|@animateicons\/react(?:\/[^"']+)?)["']/.test(source) ? [file] : [];
    });
    const inlineSvgViolations = Object.entries(sourceFiles).flatMap(([file, source]) => /<svg\b/i.test(source) ? [file] : []);
    expect(iconSource).toMatch(/from\s+["']lucide-react["']/);
    expect(iconSource).not.toContain("@animateicons/react");
    expect(styleSource).not.toContain(".animate-icon-shell:hover .animate-icon-motion");
    expect(styleSource).toContain(":focus-visible) .animate-icon-motion");
    expect(styleSource).toContain(":active .animate-icon-motion");
    expect(iconDependencyViolations).toEqual([]);
    expect(inlineSvgViolations).toEqual([]);
  });

  it("keeps left and right panel scroll content width-constrained", () => {
    expect(styleSource).toContain('.panel-scroll-area [data-slot="scroll-area-viewport"] > div');
    expect(styleSource).toMatch(/\.panel-scroll-area[^}]+display:\s*block\s*!important;[^}]+width:\s*100%;[^}]+min-width:\s*0\s*!important;/s);
  });

  it("uses configurable padding tokens in major layout sources", () => {
    const violations = Object.entries(majorLayoutPaddingTokens).flatMap(([file, tokens]) => {
      const source = sourceFiles[file] ?? "";
      return tokens.every((token) => new RegExp(`p(?:[trblxy])?-\\[var\\(${token}\\)\\]`).test(source)) ? [] : [file];
    });

    expect(styleSource).toContain("--container-padding: 12px");
    expect(styleSource).toContain("--container-padding-tight: max(4px, calc(var(--container-padding) - 4px))");
    expect(styleSource).toContain("--container-padding-loose: calc(var(--container-padding) + 4px)");
    expect(Object.keys(majorLayoutPaddingTokens).some((file) => file.includes("/components/ui/"))).toBe(false);
    expect(violations).toEqual([]);
  });

  it("allows component theme colors to override native control defaults", () => {
    const controlDefaults = styleSource.match(/button,\s*\ninput,\s*\ntextarea\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(controlDefaults).not.toMatch(/color\s*:/);
  });

  it("keeps typography scalable and interactive cursors explicit", () => {
    const hardcodedTypography = Object.entries(sourceFiles).flatMap(([file, source]) => /text-(?:\[[0-9.]+px\]|xs\b|sm\b|base\b|lg\b|xl\b)/.test(source) ? [file] : []);
    const defaultCursor = Object.entries(sourceFiles).flatMap(([file, source]) => source.includes("cursor-default") ? [file] : []);

    expect(styleSource).toContain("--font-size-offset: 0px");
    expect(styleSource).toContain("cursor: pointer");
    expect(styleSource).toContain("cursor: text");
    expect(styleSource).toContain("cursor: not-allowed");
    expect(hardcodedTypography).toEqual([]);
    expect(defaultCursor).toEqual([]);
  });
});

function businessSources() {
  return Object.entries(sourceFiles).filter(([file]) => !file.includes("/components/ui/"));
}
