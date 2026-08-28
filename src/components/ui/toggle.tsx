"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Toggle as TogglePrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

const toggleVariants = cva(
  "inline-flex cursor-pointer touch-manipulation items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-sm)] text-[var(--font-size-12)] font-medium text-[var(--text-secondary)] transition-[background-color,color,border-color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-out)] outline-none hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:shadow-[var(--focus-ring)] active:scale-[0.96] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 data-[state=on]:bg-[var(--accent-tint)] data-[state=on]:text-[var(--accent)] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border border-[var(--control-border)] bg-[var(--control-bg)] shadow-[var(--control-shadow)] hover:border-[var(--control-border-hover)] hover:bg-[var(--control-bg-hover)]",
      },
      size: {
        default: "h-7 min-w-7 px-2.5",
        sm: "h-6 min-w-6 px-2",
        lg: "h-8 min-w-8 px-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
