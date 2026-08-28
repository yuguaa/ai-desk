import * as React from "react";
import { cn } from "@/lib/utils";

function ColorInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return <input {...props} type="color" data-slot="color-input" className={cn("color-input", className)} />;
}

export { ColorInput };
