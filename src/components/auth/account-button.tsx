"use client";

import { LoaderCircle, LogIn } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DropdownMenu as DM } from "radix-ui";
import type { AuthUser } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Tip } from "@/components/ui/tooltip";
import { AUTH_NOT_CONFIGURED_REASON } from "@/lib/supabase/config";
import { cn } from "@/lib/utils";
import { initials, useAuth } from "./auth-context";

/** Fixed slot so loading → signed out → signed in never shifts the header. */
const SLOT = "flex h-8 w-11 shrink-0 items-center justify-end coarse:h-11 sm:w-[84px]";

export function Avatar({ user, className }: { user: AuthUser; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 type-meta text-fg shadow-[inset_0_0_0_1px_var(--color-border-control)]",
        className,
      )}
    >
      {user.avatarUrl && !failed ? (
        // A remote Google avatar; next/image would need a remotePatterns config change.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.avatarUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        initials(user)
      )}
    </span>
  );
}

/**
 * Header account control: "Sign in" (Google) when signed out, an avatar with the account menu when
 * signed in, disabled with a reason when auth isn't configured.
 */
export function AccountButton() {
  const { state, signingIn, signingOut, signIn, signOut } = useAuth();

  if (state.status === "loading") {
    return (
      <span className={SLOT} data-testid="account-loading" aria-busy="true">
        <span className="sr-only">Checking sign-in</span>
      </span>
    );
  }

  if (state.status === "signed-in") {
    const { user } = state;
    const label = user.name ?? user.email ?? "your account";
    return (
      <span className={SLOT}>
        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              data-testid="account-button"
              aria-label={`Account menu for ${label}`}
              className="press flex size-8 items-center justify-center rounded-full hover:bg-surface-2 coarse:size-11"
            >
              <Avatar user={user} />
            </button>
          </MenuTrigger>
          <MenuContent align="end" className="min-w-[260px]">
            <div className="flex items-center gap-3 px-2.5 py-2" data-testid="account-identity">
              <Avatar user={user} className="size-9" />
              <div className="flex min-w-0 flex-col">
                {user.name && <span className="truncate type-ui text-fg">{user.name}</span>}
                {user.email && <span className="truncate type-meta text-fg-muted">{user.email}</span>}
              </div>
            </div>
            <DM.Separator className="my-1 h-px bg-border" />
            <MenuItem asChild>
              <Link href="/account">Account settings</Link>
            </MenuItem>
            <MenuItem disabled={signingOut} onSelect={() => void signOut()}>
              {signingOut ? "Signing out" : "Sign out"}
            </MenuItem>
          </MenuContent>
        </Menu>
      </span>
    );
  }

  const unconfigured = state.status === "unconfigured";
  const button = (
    <Button
      variant="ghost"
      data-testid="sign-in"
      aria-label={signingIn ? "Signing in with Google" : "Sign in with Google"}
      aria-disabled={unconfigured || signingIn ? true : undefined}
      className="gap-1.5 max-sm:w-11 max-sm:px-0"
      onClick={signIn}
    >
      {signingIn ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
      ) : (
        <LogIn className="size-4 sm:hidden" aria-hidden />
      )}
      <span className="max-sm:sr-only">{signingIn ? "Signing in" : "Sign in"}</span>
    </Button>
  );
  return (
    <span className={SLOT}>
      <Tip label={unconfigured ? AUTH_NOT_CONFIGURED_REASON : "Sign in with Google"} className="max-w-[260px]">
        {button}
      </Tip>
    </span>
  );
}
