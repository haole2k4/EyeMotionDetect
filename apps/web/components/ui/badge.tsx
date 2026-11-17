import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[#0066CC] text-white hover:bg-[#0055B3]",
        secondary:
          "border-black/[0.08] bg-[#F2F2F7] text-[#1D1D1F] hover:bg-[#E5E5EA]",
        destructive:
          "border-[#FFB8B5] bg-[#FFECEB] text-[#D70015]",
        success:
          "border-[#86EFAC] bg-[#ECFDF3] text-[#12783D]",
        warning:
          "border-[#FCD34D] bg-[#FFF8EB] text-[#9A4600]",
        outline: "border-black/[0.12] bg-white/85 text-[#1D1D1F]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
