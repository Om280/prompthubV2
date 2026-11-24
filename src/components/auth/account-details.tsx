"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AuthUser } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/client/auth";
import { Avatar } from "./account-button";

/**
 * The /account page body. `user` was verified on the server (`getClaims()`); this component only
 * renders it and runs Sign out. The AI section is text only: there is no usage data or key entry
 * yet, so nothing here shows numbers or a field.
 */
export function AccountDetails({ user }: { user: AuthUser }) {
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

      <section className="ih-prose-section">
        <h2>AI features</h2>
        <p>
          AI features will use Google Gemini on its free tier, with daily limits per account. On the free tier, Google
          may use the text you send to improve its products, so don&apos;t include personal or sensitive information.
          Basic Mode never sends anything to Google.
        </p>
        <p>
          AI is coming in a later update. Until then, PromptHub runs in Basic Mode.{" "}
          <Link href="/privacy" className="ih-link">
            Read the privacy notice
          </Link>
          .
        </p>
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
