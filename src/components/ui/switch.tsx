"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full border transition-[background-color,border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-out)] outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-45 data-[size=default]:h-[18px] data-[size=default]:w-7 data-[size=sm]:h-3.5 data-[size=sm]:w-6 data-[state=checked]:border-[var(--accent)] data-[state=checked]:bg-[var(--accent)] data-[state=unchecked]:border-[var(--control-border)] data-[state=unchecked]:bg-[var(--control-bg)]",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none absolute left-px top-1/2 block -translate-y-1/2 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0_/_0.3)] transition-transform duration-[var(--motion-base)] ease-[var(--ease-out)] group-data-[size=default]/switch:size-3.5 group-data-[size=sm]/switch:size-3 data-[state=checked]:translate-x-[10px] data-[state=unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
