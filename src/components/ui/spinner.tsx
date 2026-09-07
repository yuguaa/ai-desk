import { LoaderCircle, type IconProps } from "@/components/ui/icons"
import { cn } from "@/lib/utils"

function Spinner({ className, strokeWidth = 3, ...props }: IconProps) {
  return (
    <LoaderCircle
      role="status"
      aria-label="加载中"
      className={cn("size-4 shrink-0 self-center align-middle leading-none animate-spin", className)}
      strokeWidth={strokeWidth}
      {...props}
    />
  )
}

export { Spinner }
