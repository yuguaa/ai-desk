import { memo, useMemo } from "react";
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

export const CodeBlock = memo(function CodeBlock({ content, language, showLineNumbers = false, className }: { content: string; language: string; showLineNumbers?: boolean; className?: string }) {
  const highlighted = useMemo(() => highlightCode(content, language), [content, language]);
  const lineNumbers = useMemo(() => {
    if (!showLineNumbers) return "";
    /*
     * 只扫描换行位置，不拆分正文；行号使用单个文本节点避免万行 DOM。
     */
    const numbers = ["1"];
    for (let index = content.indexOf("\n"); index !== -1; index = content.indexOf("\n", index + 1)) {
      numbers.push(String(numbers.length + 1));
    }
    return numbers.join("\n");
  }, [content, showLineNumbers]);
  return <div className={`flex min-w-max font-mono text-[var(--font-size-11)] leading-5 ${className ?? ""}`}>
    {showLineNumbers && <div aria-hidden="true" className="sticky left-0 z-10 shrink-0 select-none whitespace-pre border-r border-[var(--border-subtle)] bg-[var(--bg-window)] px-3 py-2 text-right text-[var(--font-size-9)] text-[var(--text-tertiary)]">{lineNumbers}</div>}
    <pre className="m-0 min-w-max px-3 py-2"><code className="hljs" dangerouslySetInnerHTML={{ __html: highlighted }} /></pre>
  </div>;
});

export function highlightCode(content: string, language: string) {
  const normalizedLanguage = normalizeLanguage(language);
  return normalizedLanguage && hljs.getLanguage(normalizedLanguage)
    ? hljs.highlight(content, { language: normalizedLanguage, ignoreIllegals: true }).value
    : escapeHtml(content);
}

export const InlineCode = memo(function InlineCode({ content, language, className }: { content: string; language: string; className?: string }) {
  const highlighted = useMemo(() => highlightCode(content, language), [content, language]);
  return <code className={`hljs whitespace-pre-wrap ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: highlighted }} />;
});

function normalizeLanguage(language: string) {
  if (language === "text") return "plaintext";
  return language.toLowerCase();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}
