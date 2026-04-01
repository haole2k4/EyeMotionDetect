import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { GazeProvider } from "../components/gaze/GazeProvider";
import { DebugOverlay } from "../components/gaze/DebugOverlay";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Eye Gaze Control",
  description: "Web-based eye tracking for mouse control",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <GazeProvider>
          {children}
          <DebugOverlay />
        </GazeProvider>
      </body>
    </html>
  );
}
