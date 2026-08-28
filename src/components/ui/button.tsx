import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer touch-manipulation select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-sm)] text-[var(--font-size-12)] font-medium transition-[background-color,color,border-color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-out)] outline-none active:scale-[0.96] focus-visible:shadow-[var(--focus-ring)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default: "bg-[var(--accent)] text-white shadow-[inset_0_1px_0_rgb(255_255_255_/_0.08)] hover:bg-[var(--accent-hover)] active:bg-[var(--accent-active)]",
        destructive: "bg-[var(--error-tint)] text-[var(--error)] hover:bg-[color-mix(in_srgb,var(--error)_18%,transparent)]",
        outline: "border border-[var(--control-border)] bg-[var(--control-bg)] text-[var(--text-secondary)] shadow-[var(--control-shadow)] hover:border-[var(--control-border-hover)] hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-primary)]",
        secondary: "bg-[var(--bg-surface-raised)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]",
        ghost: "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
        link: "text-[var(--accent)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-7 px-3 has-[>svg]:pl-2.5 has-[>svg]:pr-3",
        xs: "h-6 gap-1 px-2 text-[var(--font-size-11)] has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 px-2.5 text-[var(--font-size-11-5)] has-[>svg]:pl-2 has-[>svg]:pr-2.5",
        lg: "h-8 px-4 text-[var(--font-size-12-5)] has-[>svg]:pl-3.5 has-[>svg]:pr-4",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
