import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AccountDetails } from "@/components/auth/account-details";
import { PageShell } from "@/components/auth/page-shell";
import { getVerifiedUser } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "Account settings, PromptHub",
};

/**
 * /account. The session read happens at request time, so with Cache Components it sits behind a
 * Suspense boundary and the shell prerenders. Identity is verified with `getClaims()`
 * (`getVerifiedUser`); signed-out visitors go to `/?signin=required` (the proxy redirects first when
 * auth is configured; this is the second check).
 */
export default function AccountPage() {
  return (
    <PageShell
      title="Account settings"
      footer={
        <Link href="/privacy" className="ih-link">
          Privacy
        </Link>
      }
    >
      <Suspense fallback={<AccountSkeleton />}>
        <VerifiedAccount />
      </Suspense>
    </PageShell>
  );
}

async function VerifiedAccount() {
  // Request-time only: verifying the session reads cookies and the clock, so no prerender (build or
  // runtime prefetch) may run past this point.
  await connection();
  const user = await getVerifiedUser();
  if (!user) redirect("/?signin=required");
  return <AccountDetails user={user} />;
}

function AccountSkeleton() {
  return (
    <div className="ih-account-profile" aria-busy="true">
      <span className="ih-sr">Loading your account</span>
      <span className="ih-skel h-11 w-11 rounded-full" aria-hidden />
      <span className="grid gap-2" aria-hidden>
        <span className="ih-skel h-4 w-48" />
        <span className="ih-skel h-3.5 w-64" />
      </span>
    </div>
  );
}
