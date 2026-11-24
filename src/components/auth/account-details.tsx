"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AiStatusResponse, AuthUser, UsageCount } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/client/auth";
import { resetLabel } from "@/components/workspace/ai";
import { Avatar } from "./account-button";

/**
 * The /account page body. `user` was verified on the server (`getClaims()`); this component only
 * renders it and runs Sign out. The AI section is text only: there is no usage data or key entry
 * yet, so nothing here shows numbers or a field.
 */
export function AccountDetails({ user, ai }: { user: AuthUser; ai: AiStatusResponse | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSignOut = async () => {
    setBusy(true);
    setError(null);
    const failed = await signOut();
    if (failed) {
      setBusy(false);
      setError(failed);
      return;
    }
    router.replace("/");
    router.refresh();
  };

  return (
    <div data-testid="account-details" className="ih-account-page">
      <section className="ih-account-profile" aria-label="Profile">
        <Avatar user={user} size="lg" />
        <div className="min-w-0">
          {user.name && <p className="ih-account-name">{user.name}</p>}
          {user.email && <p className="ih-account-email">{user.email}</p>}
          <p className="ih-hint">Signed in with Google</p>
        </div>
      </section>

      <section className="ih-prose-section">
        <h2>History</h2>
        <p>
          Your prompt history stays on this device, in this browser. Signing in doesn&apos;t upload or sync it, and
          signing out doesn&apos;t delete it.
        </p>
      </section>

      <section className="ih-prose-section" aria-labelledby="ai-heading">
        <h2 id="ai-heading">AI features</h2>
        <p>
          AI features use Google Gemini on its free tier, with daily limits per account. On the free tier, Google may
          use the text you send to improve its products, so don&apos;t include personal or sensitive information. Basic
          Mode never sends anything to Google.{" "}
          <Link href="/privacy" className="ih-link">
            Read the privacy notice
          </Link>
          .
        </p>
        <AiUsage ai={ai} />
      </section>

      <section className="ih-prose-section">
        <h2>Sign out</h2>
        <p>Signs you out on this device.</p>
        <Button
          variant="secondary"
          className="mt-4"
          aria-disabled={busy ? true : undefined}
          onClick={() => void onSignOut()}
        >
          <LogOut size={16} aria-hidden />
          {busy ? "Signing out" : "Sign out"}
        </Button>
        {error && (
          <p role="alert" className="ih-hint ih-danger-text mt-3">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}

/** One allowance as a meter: "3 of 20 used". */
function Meter({ label, count }: { label: string; count: UsageCount }) {
  const pct = Math.min(100, Math.round((count.used / count.limit) * 100));
  return (
    <div className="ih-meter">
      <div className="ih-meter-head">
        <span>{label}</span>
        <span className="ih-meter-count" data-testid={`usage-${label.toLowerCase().replace(/\s+/g, "-")}`}>
          {count.used} of {count.limit} used
        </span>
      </div>
      <div
        className="ih-meter-track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={count.limit}
        aria-valuenow={count.used}
        aria-valuetext={`${count.used} of ${count.limit} used`}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Today's allowance, read from the user's own usage rows; a plain note when it can't be read. */
function AiUsage({ ai }: { ai: AiStatusResponse | null }) {
  if (!ai) return <p className="ih-hint">AI status couldn&apos;t be checked right now. Basic Mode still works.</p>;
  const ready = ai.ai.status === "ready" || ai.ai.status === "quota-exhausted";
  const at = ai.usage ? resetLabel(ai.usage.resetsAt) : null;
  return (
    <div className="ih-usage" data-testid="account-usage">
      <h3>Today</h3>
      {!ready ? (
        <p>{ai.ai.message}</p>
      ) : ai.usage ? (
        <>
          <Meter label="Prompt workflows" count={ai.usage.workflows} />
          <Meter label="Refinements" count={ai.usage.refinements} />
          <p className="ih-hint">
            A workflow is one new prompt (its questions and its first version). Refinements are Improve, Shorten,
            Expand, Tone and Regenerate.{at ? ` Both reset ${at}, your time.` : ""}
          </p>
        </>
      ) : (
        <p data-testid="usage-unavailable">
          Today&apos;s usage couldn&apos;t be read right now. Your daily limits still apply, and Basic Mode always works.
        </p>
      )}
      {ai.ai.limits && <p className="ih-hint">{ai.ai.limits.description}</p>}
    </div>
  );
}
