import type { Metadata } from "next";
import { PageShell } from "@/components/auth/page-shell";
import { GEMINI_PRICING_URL } from "@/lib/ai/disclosure";

export const metadata: Metadata = {
  title: "Privacy, PromptHub",
  description: "What PromptHub stores, where, and what is sent to Google when AI is used.",
};


/** Public, static privacy notice in plain language. */
export default function PrivacyPage() {
  return (
    <PageShell title="Privacy">
      <div className="ih-prose">
        <p>Last updated 24 November 2026. This page explains, in plain language, what PromptHub keeps and where.</p>

        <h2>Your prompt history stays in your browser</h2>
        <p>
          Your ideas, answers and prompts, and every version of them, are saved only in this browser&apos;s local
          storage (IndexedDB) on this device. They are not uploaded to PromptHub&apos;s servers or synced between
          devices, and signing in or out doesn&apos;t change that. Clearing your browser&apos;s site data deletes them.
        </p>

        <h2>What PromptHub stores about your account</h2>
        <p>Sign-in is optional and uses Google through Supabase, our authentication provider. Supabase stores:</p>
        <ul>
          <li>your Google account basics: name, email address, profile picture link and account id;</li>
          <li>sign-in sessions, kept in cookies in your browser;</li>
          <li>
            for AI features: usage counters (how many requests you made in a minute or a day) and usage records
            (operation, model, token counts, status, duration, and a one-way hash of the request), used to enforce
            limits and keep the free service running.
          </li>
        </ul>
        <p>PromptHub never stores the text of your ideas, answers or prompts on its servers.</p>

        <h2>When you use AI, your text is sent to Google</h2>
        <p>
          AI features send your idea, your answers and your prompt text to Google&apos;s Gemini
          API to write or rewrite the prompt. PromptHub uses Gemini&apos;s <strong>free tier</strong>.
          On the free tier, Google states that submitted content is used to improve its products (&ldquo;Content used to
          improve our products&rdquo;). See{" "}
          <a href={GEMINI_PRICING_URL} className="ih-link" rel="noreferrer" target="_blank">
            Google&apos;s Gemini API pricing page
          </a>{" "}
          for Google&apos;s current terms.
        </p>
        <p>
          <strong>Don&apos;t include personal, confidential or sensitive information</strong> in
          anything you send to AI.
        </p>

        <h2>Basic Mode sends nothing to Google</h2>
        <p>
          Basic Mode builds prompts from local templates. It doesn&apos;t need an account, and none of your text is sent
          to Google or any other AI provider.
        </p>

        <h2>Logs</h2>
        <p>
          Our servers keep short technical error logs. They never include your text, and secrets such as keys and session
          tokens are masked.
        </p>

        <h2>Your choices</h2>
        <ul>
          <li>Use Basic Mode without signing in.</li>
          <li>Sign out any time from the account menu; history on this device stays.</li>
          <li>Delete your history by clearing this site&apos;s data in your browser.</li>
        </ul>
      </div>
    </PageShell>
  );
}
