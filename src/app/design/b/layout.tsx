import { Bodoni_Moda, Schibsted_Grotesk } from "next/font/google";
import type { Metadata } from "next";
import type { ReactNode } from "react";

/** Direction B type: Bodoni Moda (display, optical size axis) and Schibsted Grotesk (text and UI). */
const display = Bodoni_Moda({
  subsets: ["latin"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--b-display",
});

const text = Schibsted_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--b-text",
});

export const metadata: Metadata = {
  title: "PromptHub, Direction B: Night studio",
};

export default function DirectionBLayout({ children }: { children: ReactNode }) {
  return <div className={`${display.variable} ${text.variable}`}>{children}</div>;
}
