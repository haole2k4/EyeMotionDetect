"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="top-right"
      richColors
      closeButton
      duration={3500}
      className="toaster group z-[100000]"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          zIndex: 100000,
          "--normal-bg": "rgba(255, 255, 255, 0.88)",
          "--normal-text": "#1D1D1F",
          "--normal-border": "rgba(255, 255, 255, 0.85)",
          "--border-radius": "1rem",
        } as React.CSSProperties
      }
      toastOptions={{
        style: {
          boxShadow:
            "0 16px 36px -6px rgba(0, 0, 0, 0.14), 0 4px 10px -2px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(60, 60, 67, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.95)",
        },
        classNames: {
          toast:
            "!rounded-2xl !border !border-white/85 !bg-white/88 !backdrop-blur-2xl !backdrop-saturate-180 !text-[#1D1D1F] !shadow-[0_16px_36px_-6px_rgba(0,0,0,0.14),0_4px_10px_-2px_rgba(0,0,0,0.06),0_0_0_1px_rgba(60,60,67,0.08),inset_0_1px_0_rgba(255,255,255,0.95)] !font-sans",
          title: "!text-sm !font-semibold !text-[#1D1D1F]",
          description: "!text-xs !text-[#515154]",
          closeButton: "!bg-[#767680]/12 !border-transparent !text-[#3C3C43] hover:!bg-[#767680]/20 hover:!text-[#1D1D1F]",
          success: "!border-[#86EFAC] !bg-white/92 !text-[#1D1D1F] [&_svg]:!text-[#12783D]",
          error: "!border-[#FFB8B5] !bg-white/92 !text-[#1D1D1F] [&_svg]:!text-[#D70015]",
          info: "!border-[#BFDBFE] !bg-white/92 !text-[#1D1D1F] [&_svg]:!text-[#0066CC]",
          warning: "!border-[#FCD34D] !bg-white/92 !text-[#1D1D1F] [&_svg]:!text-[#9A4600]",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
