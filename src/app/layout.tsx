import type { Metadata, Viewport } from "next";
import { Mona_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { THEME_INIT_SCRIPT } from "@/lib/client/theme";
import "./globals.css";

const mona = Mona_Sans({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  variable: "--font-mona",
});

export const metadata: Metadata = {
  title: "PromptHub",
  description: "Turn a rough idea into a clear prompt for ChatGPT, Claude or Gemini.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#121816",
  colorScheme: "dark light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={mona.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
