import type { Metadata } from "next";
import Link from "next/link";
import { GEMINI_PRICING_URL } from "@/lib/ai/disclosure";

export const metadata: Metadata = {
  title: "Privacy · PromptHub",
  description: "What PromptHub stores, where, and what is sent to Google when AI is used.",
};

const H2 = "mt-10 type-ui text-fg-strong";
const P = "mt-2 type-body text-fg-muted";
const LI = "type-body text-fg-muted";

/** Public, static privacy notice in plain language. */
export default function PrivacyPage() {
  return (
    <div className="min-h-dvh">
      <header className="flex h-14 items-center gap-2 px-[calc(var(--gutter)-8px)]">
        <Link href="/" className="press rounded-sm px-2 py-1 type-wordmark text-fg-strong hover:bg-surface-2">
          PromptHub
        </Link>
      </header>
      <main className="column pb-24 pt-8">
        <h1 className="type-title text-fg-strong">Privacy</h1>
        <p className={P}>Last updated 24 November 2026. This page explains, in plain language, what PromptHub keeps and where.</p>

        <h2 className={H2}>Your prompt history stays in your browser</h2>
        <p className={P}>
          Your ideas, answers and prompts, and every version of them, are saved only in this browser&apos;s local
          storage (IndexedDB) on this device. They are not uploaded to PromptHub&apos;s servers or synced between
          devices, and signing in or out doesn&apos;t change that. Clearing your browser&apos;s site data deletes them.
        </p>

        <h2 className={H2}>What PromptHub stores about your account</h2>
        <p className={P}>Sign-in is optional and uses Google through Supabase, our authentication provider. Supabase stores:</p>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
          <li className={LI}>your Google account basics: name, email address, profile picture link and account id;</li>
          <li className={LI}>sign-in sessions, kept in cookies in your browser;</li>
          <li className={LI}>
            for AI features: usage counters (how many requests you made in a minute or a day) and usage records
            (operation, model, token counts, status, duration, and a one-way hash of the request), used to enforce
            limits and keep the free service running.
          </li>
        </ul>
        <p className={P}>PromptHub never stores the text of your ideas, answers or prompts on its servers.</p>

        <h2 className={H2}>When you use AI, your text is sent to Google</h2>
        <p className={P}>
          AI features (coming in a later update) send your idea, your answers and your prompt text to Google&apos;s Gemini
          API to write or rewrite the prompt. PromptHub uses Gemini&apos;s <strong className="text-fg">free tier</strong>.
          On the free tier, Google states that submitted content is used to improve its products (&ldquo;Content used to
          improve our products&rdquo;). See{" "}
          <a href={GEMINI_PRICING_URL} className="text-accent hover:text-accent-hover" rel="noreferrer" target="_blank">
            Google&apos;s Gemini API pricing page
          </a>{" "}
          for Google&apos;s current terms.
        </p>
        <p className={P}>
          <strong className="text-fg">Don&apos;t include personal, confidential or sensitive information</strong> in
          anything you send to AI.
        </p>

        <h2 className={H2}>Basic Mode sends nothing to Google</h2>
        <p className={P}>
          Basic Mode builds prompts from local templates. It doesn&apos;t need an account, and none of your text is sent
          to Google or any other AI provider.
        </p>

        <h2 className={H2}>Logs</h2>
        <p className={P}>
          Our servers keep short technical error logs. They never include your text, and secrets such as keys and session
          tokens are masked.
        </p>

        <h2 className={H2}>Your choices</h2>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
          <li className={LI}>Use Basic Mode without signing in.</li>
          <li className={LI}>Sign out any time from the account menu; history on this device stays.</li>
          <li className={LI}>Delete your history by clearing this site&apos;s data in your browser.</li>
        </ul>
      </main>
    </div>
  );
}
