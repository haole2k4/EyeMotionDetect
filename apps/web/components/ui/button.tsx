"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-xl border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-[transform,background,box-shadow,border-color,color] duration-150 ease-out outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 active:not-aria-[haspopup]:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-[#0A7AFF] to-[#0062CC] text-white shadow-[0_2px_6px_rgba(0,102,204,0.28),0_1px_2px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.32)] hover:from-[#006EE6] hover:to-[#0055B3] active:from-[#005BBF] active:to-[#004799]",
        outline:
          "border-black/[0.12] bg-white/85 backdrop-blur-md text-[#1D1D1F] shadow-[0_1px_2px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.9)] hover:bg-[#F2F2F7] hover:border-black/[0.18] aria-expanded:bg-[#F2F2F7] aria-expanded:text-[#1D1D1F]",
        secondary:
          "border-transparent bg-[#767680]/12 text-[#1D1D1F] hover:bg-[#767680]/18 aria-expanded:bg-[#767680]/18 aria-expanded:text-[#1D1D1F]",
        ghost:
          "text-[#1D1D1F] hover:bg-[#767680]/10 hover:text-[#1D1D1F] aria-expanded:bg-[#767680]/10 aria-expanded:text-[#1D1D1F]",
        destructive:
          "border-[#FFB8B5] bg-[#FFECEB] text-[#D70015] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] hover:bg-[#FFDAD8] hover:border-[#FFA19D] focus-visible:border-destructive focus-visible:ring-destructive/30",
        link: "text-[#0066CC] underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-11 gap-2 rounded-xl px-4 text-sm font-semibold has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1 rounded-[8px] px-2.5 text-xs font-semibold in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 rounded-[10px] px-3 text-xs font-semibold in-data-[slot=button-group]:rounded-[10px] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 gap-2 rounded-[14px] px-6 text-base font-semibold has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
        icon: "size-10 rounded-xl",
        "icon-xs":
          "size-7 rounded-[8px] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm":
          "size-9 rounded-[10px] in-data-[slot=button-group]:rounded-[10px]",
        "icon-lg": "size-11 rounded-[14px]",
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
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
