import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex h-[18px] w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-[var(--radius-xs)] border border-transparent px-1.5 text-[var(--font-size-10-5)] font-medium leading-none whitespace-nowrap transition-[color,background-color,border-color,box-shadow] duration-[var(--motion-fast)] focus-visible:shadow-[var(--focus-ring)] [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-[var(--accent-tint)] text-[var(--accent)]",
        secondary: "bg-[var(--bg-hover)] text-[var(--text-secondary)]",
        destructive: "bg-[var(--error-tint)] text-[var(--error)]",
        outline: "border-[var(--border-default)] bg-[var(--control-bg)] text-[var(--text-secondary)]",
        ghost: "text-[var(--text-secondary)] [a&]:hover:bg-[var(--bg-hover)]",
        link: "text-[var(--accent)] underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
