import Link from "next/link";
import type { ReactNode } from "react";
import { Mark } from "@/components/workspace/mark";

/**
 * Shell for the account and privacy pages: the canvas, the mark and wordmark back to the workspace,
 * one paper sheet with a 32px display title, and a footer.
 */
export function PageShell({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="ih-app">
      <header className="ih-topbar">
        <Link href="/" className="ih-brand" aria-label="PromptHub, back to your prompts">
          <Mark />
          <span className="ih-wordmark" aria-hidden>
            PromptHub
          </span>
        </Link>
      </header>
      <main className="ih-page">
        <h1 className="ih-page-title">{title}</h1>
        <div className="ih-sheet ih-page-sheet">{children}</div>
      </main>
      {footer && <footer className="ih-page-foot">{footer}</footer>}
    </div>
  );
}
