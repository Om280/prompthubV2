import { Funnel_Display, Schibsted_Grotesk } from "next/font/google";
import type { ReactNode } from "react";

const display = Funnel_Display({ subsets: ["latin"], variable: "--c-font-display", display: "swap" });
const text = Schibsted_Grotesk({ subsets: ["latin"], variable: "--c-font-text", display: "swap" });

export const metadata = { title: "PromptHub, Direction C" };

export default function DirectionCLayout({ children }: { children: ReactNode }) {
  return <div className={`${display.variable} ${text.variable}`}>{children}</div>;
}
