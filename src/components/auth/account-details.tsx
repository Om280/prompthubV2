"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AuthUser } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/client/auth";
import { Avatar } from "./account-button";

const SECTION = "mt-10 border-t border-border pt-6";
const HEADING = "type-ui text-fg-strong";
const BODY = "mt-2 type-body text-fg-muted";

/**
 * The /account page body. `user` was verified on the server (`getClaims()`); this component only
 * renders it and runs Sign out. The AI section is text only: there is no key entry yet.
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
    <div data-testid="account-details">
      <section className="mt-8 flex items-center gap-4" aria-label="Profile">
        <Avatar user={user} className="size-12 type-ui" />
        <div className="flex min-w-0 flex-col">
          {user.name && <p className="truncate type-ui text-fg-strong">{user.name}</p>}
          {user.email && <p className="truncate type-meta text-fg-muted">{user.email}</p>}
          <p className="type-meta text-fg-subtle">Signed in with Google</p>
        </div>
      </section>

      <section className={SECTION}>
        <h2 className={HEADING}>History</h2>
        <p className={BODY}>
          Your prompt history stays on this device, in this browser. Signing in doesn&apos;t upload or sync it, and
          signing out doesn&apos;t delete it.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={HEADING}>AI features</h2>
        <p className={BODY}>
          AI features will use Google Gemini on its free tier, with daily limits per account. On the free
          tier, Google may use the text you send to improve its products, so don&apos;t include personal or
          sensitive information. Basic Mode never sends anything to Google.
        </p>
        <p className={BODY}>
          AI is coming in a later update. Until then, PromptHub runs in Basic Mode.{" "}
          <Link href="/privacy" className="text-accent hover:text-accent-hover">
            Read the privacy notice
          </Link>
          .
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={HEADING}>Sign out</h2>
        <p className={BODY}>Signs you out on this device.</p>
        <Button variant="outline" className="mt-4" aria-disabled={busy ? true : undefined} onClick={() => void onSignOut()}>
          {busy ? "Signing out" : "Sign out"}
        </Button>
        {error && (
          <p role="alert" className="mt-3 type-meta text-danger">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
