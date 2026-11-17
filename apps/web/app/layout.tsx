import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "EyeMotionDetect | Hệ thống thi trắc nghiệm điều khiển bằng ánh mắt",
  description:
    "Nền tảng thi trắc nghiệm trực tuyến điều khiển bằng cử động mắt chuẩn trợ năng WCAG AAA.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className={`${geistSans.variable} antialiased font-sans bg-background text-foreground`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
