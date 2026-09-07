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
