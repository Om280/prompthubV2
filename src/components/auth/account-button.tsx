"use client";

import { LoaderCircle, LogIn, LogOut, Settings, Shield } from "lucide-react";
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

/**
 * The avatar (DIRECTION-C §5): initials on graphite, or the Google picture when there is one.
 * `size` "lg" is the 44px avatar in the menu and on /account.
 */
export function Avatar({ user, size = "md", className }: { user: AuthUser; size?: "md" | "lg"; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span aria-hidden className={cn("ih-avatar", className)} data-size={size}>
      {user.avatarUrl && !failed ? (
        // A remote Google avatar; next/image would need a remotePatterns config change.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        initials(user)
      )}
    </span>
  );
}

/**
 * Top bar account control: "Sign in with Google" when signed out, the avatar and account menu when
 * signed in, disabled with the reason when sign-in isn't set up on this server. A fixed slot keeps
 * loading → signed out → signed in from shifting the bar.
 */
export function AccountButton() {
  const { state, signingIn, signingOut, signIn, signOut } = useAuth();

  if (state.status === "loading") {
    return (
      <span className="ih-account" data-testid="account-loading" aria-busy="true">
        <span className="ih-sr">Checking sign-in</span>
      </span>
    );
  }

  if (state.status === "signed-in") {
    const { user } = state;
    const label = user.name ?? user.email ?? "your account";
    return (
      <span className="ih-account">
        <Menu>
          <MenuTrigger asChild>
            <button type="button" data-testid="account-button" aria-label={`Account menu for ${label}`} className="ih-avatar-btn">
              <Avatar user={user} />
            </button>
          </MenuTrigger>
          <MenuContent align="end" className="ih-account-menu">
            <div className="ih-account-identity" data-testid="account-identity">
              <Avatar user={user} size="lg" />
              <div className="min-w-0">
                {user.name && <p className="ih-account-name">{user.name}</p>}
                {user.email && <p className="ih-account-email">{user.email}</p>}
              </div>
            </div>
            <DM.Separator className="ih-menu-sep" />
            <MenuItem asChild>
              <Link href="/account">
                <Settings size={16} aria-hidden />
                Account settings
              </Link>
            </MenuItem>
            <MenuItem asChild>
              <Link href="/privacy">
                <Shield size={16} aria-hidden />
                Privacy
              </Link>
            </MenuItem>
            <MenuItem disabled={signingOut} onSelect={() => void signOut()}>
              <LogOut size={16} aria-hidden />
              {signingOut ? "Signing out" : "Sign out"}
            </MenuItem>
          </MenuContent>
        </Menu>
      </span>
    );
  }

  const unconfigured = state.status === "unconfigured";
  return (
    <span className="ih-account">
      <Tip label={unconfigured ? AUTH_NOT_CONFIGURED_REASON : "Sign in with Google"} className="max-w-[260px]">
        <Button
          variant="secondary"
          data-testid="sign-in"
          aria-label={signingIn ? "Signing in with Google" : "Sign in with Google"}
          aria-disabled={unconfigured || signingIn ? true : undefined}
          className="ih-sign-in"
          onClick={signIn}
        >
          {signingIn ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <LogIn size={16} aria-hidden />}
          <span className="ih-sign-in-long" aria-hidden>
            {signingIn ? "Signing in" : "Sign in with Google"}
          </span>
          <span className="ih-sign-in-short" aria-hidden>
            {signingIn ? "Signing in" : "Sign in"}
          </span>
        </Button>
      </Tip>
    </span>
  );
}
