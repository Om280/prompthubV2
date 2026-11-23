import { Archivo, Source_Serif_4 } from "next/font/google";
import type { ReactNode } from "react";
import "@/components/design/a/studio.css";

const display = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  variable: "--a-display",
});

const serif = Source_Serif_4({
  subsets: ["latin"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--a-serif",
});

export const metadata = { title: "PromptHub, Direction A: Proof" };

export default function DirectionALayout({ children }: { children: ReactNode }) {
  return <div className={`${display.variable} ${serif.variable}`}>{children}</div>;
}
