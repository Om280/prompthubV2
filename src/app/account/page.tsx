import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AccountDetails } from "@/components/auth/account-details";
import { getVerifiedUser } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "Account settings · PromptHub",
};

/**
 * /account. The session read happens at request time, so with Cache Components it sits behind a
 * Suspense boundary and the shell prerenders. Identity is verified with `getClaims()`
 * (`getVerifiedUser`); signed-out visitors go to `/?signin=required` (the proxy redirects first when
 * auth is configured; this is the second check).
 */
export default function AccountPage() {
  return (
    <div className="min-h-dvh">
      <header className="flex h-14 items-center gap-2 px-[calc(var(--gutter)-8px)]">
        <Link href="/" className="press rounded-sm px-2 py-1 type-wordmark text-fg-strong hover:bg-surface-2">
          PromptHub
        </Link>
      </header>
      <main className="column pb-24 pt-8">
        <h1 className="type-title text-fg-strong">Account settings</h1>
        <Suspense fallback={<AccountSkeleton />}>
          <VerifiedAccount />
        </Suspense>
      </main>
      <footer className="column border-t border-border py-6">
        <Link href="/privacy" className="type-meta text-fg-muted hover:text-fg">
          Privacy
        </Link>
      </footer>
    </div>
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
    <div className="mt-8 flex flex-col gap-3" aria-busy="true">
      <span className="sr-only">Loading your account</span>
      <div className="h-5 w-48 rounded-xs bg-surface-2" />
      <div className="h-4 w-64 rounded-xs bg-surface-2" />
    </div>
  );
}
