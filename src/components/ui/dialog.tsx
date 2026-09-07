import type { ComponentProps } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogContent({ className, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay data-slot="dialog-overlay" className="fixed inset-0 z-50 bg-black/60" />
    <DialogPrimitive.Content
      data-slot="dialog-content"
      className={cn("fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[min(900px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-popover)] p-4 shadow-[var(--shadow-popover)]", className)}
      {...props}
    />
  </DialogPrimitive.Portal>;
}

function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn("min-w-0 break-all pr-8 text-[var(--font-size-13)] text-[var(--text-primary)]", className)} {...props} />;
}

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogTitle };
