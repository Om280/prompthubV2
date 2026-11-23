import { notFound } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Isolated design workspace for the three redesign explorations.
 * Development only: production builds return 404, so the shipped app is unaffected.
 */
export default function DesignLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
