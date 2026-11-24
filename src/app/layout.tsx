import type { Metadata, Viewport } from "next";
import { Funnel_Display, Schibsted_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { THEME_COLORS, THEME_INIT_SCRIPT } from "@/lib/client/theme";
import "./globals.css";

/** Display face: the idea, sheet titles, block labels, the wordmark. */
const display = Funnel_Display({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-funnel",
});

/** Text face: prompt text, controls, meta. */
const text = Schibsted_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-schibsted",
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light" className={`${display.variable} ${text.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
