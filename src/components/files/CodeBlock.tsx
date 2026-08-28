import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import rust from "highlight.js/lib/languages/rust";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);

export function CodeBlock({ content, language, showLineNumbers = false, className }: { content: string; language: string; showLineNumbers?: boolean; className?: string }) {
  const highlighted = highlightCode(content, language);
  const lineCount = Math.max(1, content.split("\n").length);
  return <div className={`flex min-w-max font-mono text-[var(--font-size-11)] leading-5 ${className ?? ""}`}>
    {showLineNumbers && <div aria-hidden="true" className="sticky left-0 z-10 shrink-0 select-none border-r border-[var(--border-subtle)] bg-[var(--bg-window)] px-3 py-2 text-right text-[var(--font-size-9)] text-[var(--text-tertiary)]">{Array.from({ length: lineCount }, (_, index) => <div className="min-h-5" key={index}>{index + 1}</div>)}</div>}
    <pre className="m-0 min-w-max px-3 py-2"><code className="hljs" dangerouslySetInnerHTML={{ __html: highlighted }} /></pre>
  </div>;
}

export function highlightCode(content: string, language: string) {
  const normalizedLanguage = normalizeLanguage(language);
  return normalizedLanguage && hljs.getLanguage(normalizedLanguage)
    ? hljs.highlight(content, { language: normalizedLanguage, ignoreIllegals: true }).value
    : escapeHtml(content);
}

export function InlineCode({ content, language, className }: { content: string; language: string; className?: string }) {
  return <code className={`hljs whitespace-pre-wrap ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: highlightCode(content, language) }} />;
}

export function languageForFile(path: string) {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  if (["ts", "tsx"].includes(extension)) return "typescript";
  if (["js", "jsx", "mjs", "cjs"].includes(extension)) return "javascript";
  if (["rs"].includes(extension)) return "rust";
  if (["json", "jsonl"].includes(extension)) return "json";
  if (["css", "scss"].includes(extension)) return "css";
  if (["html", "xml", "vue", "svelte"].includes(extension)) return "xml";
  if (["md", "markdown"].includes(extension)) return "markdown";
  if (["yaml", "yml"].includes(extension)) return "yaml";
  if (["sh", "bash"].includes(extension)) return "bash";
  return "plaintext";
}

function normalizeLanguage(language: string) {
  if (language === "text") return "plaintext";
  return language.toLowerCase();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}
