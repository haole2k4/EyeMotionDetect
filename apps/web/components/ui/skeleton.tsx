import * as React from "react"

import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="skeleton"
      className={cn(
        "block rounded-[10px] bg-[#767680]/14 animate-pulse motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
