import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// 轮次复制按钮：常显，点击复制文本，成功后短暂展示对勾
// 调用方如需 hover 显隐，可通过 className 传入 group-hover 类
//（若完全不传则默认常显）
export function MessageCopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number>(0);

  const copyMessage = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopied(true);
        timeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined);
  };

  useEffect(() => () => window.clearTimeout(timeoutRef.current), []);

  return <Button type="button" variant="ghost" size="icon-xs" aria-label={copied ? "已复制消息" : "复制消息"} title={copied ? "已复制" : "复制消息"} onClick={copyMessage} className={cn("size-6 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]", className)}>
    {copied ? <Check size={12} className="text-[var(--success)]" /> : <Copy size={12} />}
  </Button>;
}
