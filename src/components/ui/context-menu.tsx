import * as React from "react";
import { ContextMenu as ContextMenuPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function ContextMenu(props: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />;
}

function ContextMenuTrigger(props: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>) {
  return <ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" {...props} />;
}

function ContextMenuContent({ className, ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.Content
      data-slot="context-menu-content"
      className={cn(
        "z-50 min-w-40 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-popover)] p-1 text-[var(--font-size-12)] text-[var(--text-primary)] shadow-lg outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
        className,
      )}
      {...props}
    />
  </ContextMenuPrimitive.Portal>;
}

function ContextMenuItem({ className, ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Item>) {
  return <ContextMenuPrimitive.Item
    data-slot="context-menu-item"
    className={cn(
      "flex h-7 cursor-pointer select-none items-center gap-2 rounded-[var(--radius-sm)] px-2 outline-none transition-colors focus:bg-[var(--bg-hover)] focus:text-[var(--text-primary)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:shrink-0 [&_svg]:text-[var(--text-tertiary)]",
      className,
    )}
    {...props}
  />;
}

function ContextMenuSeparator({ className, ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return <ContextMenuPrimitive.Separator
    data-slot="context-menu-separator"
    className={cn("-mx-1 my-1 h-px bg-[var(--border-subtle)]", className)}
    {...props}
  />;
}

export { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger };
