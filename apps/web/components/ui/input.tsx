import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-xl border border-black/[0.12] bg-white/90 px-3.5 py-2 text-base text-[#1D1D1F] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] transition-[border-color,background-color,box-shadow] duration-150 outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[#1D1D1F] placeholder:text-[#515154] focus-visible:border-[#0066CC] focus-visible:bg-white focus-visible:ring-3 focus-visible:ring-[#0066CC]/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-[#F2F2F7] disabled:text-[#515154] disabled:opacity-70 aria-invalid:border-[#D70015] aria-invalid:ring-3 aria-invalid:ring-[#D70015]/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
