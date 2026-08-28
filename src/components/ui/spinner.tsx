import { LoaderCircle, type IconProps } from "@/components/ui/icons"
import { cn } from "@/lib/utils"

function Spinner({ className, ...props }: IconProps) {
  return (
    <LoaderCircle
      role="status"
      aria-label="加载中"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
