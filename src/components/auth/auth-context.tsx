"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { AuthUser, SessionResponse } from "@/lib/contracts";
import { authErrorMessage } from "@/lib/auth/safe-next";
import { fetchSession, signInWithGoogle, signOut as postSignOut } from "@/lib/client/auth";
import { AUTH_NOT_CONFIGURED_REASON } from "@/lib/supabase/config";

export type AuthState =
  | { status: "loading" }
  /** Supabase isn't configured on this server: Basic Mode only, sign-in disabled. */
  | { status: "unconfigured" }
  | { status: "signed-out" }
  | { status: "signed-in"; user: AuthUser }
  /** The session check itself failed (network); sign-in stays available. */
  | { status: "unknown" };

/**
 * A one-shot note from the URL: a failed or cancelled sign-in (`/?auth_error=`), or a page that
 * needs an account (`/?signin=required`). Shown as the sign-in card in the workspace.
 */
export interface AuthNotice {
  kind: "error" | "signin-required";
  message: string;
  /** Signing in again can help (false when sign-in isn't set up on this server). */
  canRetry: boolean;
}

export interface AuthValue {
  state: AuthState;
  notice: AuthNotice | null;
  dismissNotice: () => void;
  /** True between clicking "Sign in" and the browser leaving for Google. */
  signingIn: boolean;
  signingOut: boolean;
  signIn: () => void;
  signOut: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export const SIGNIN_REQUIRED_MESSAGE = "Sign in with Google to open account settings.";
export const SIGNED_OUT_MESSAGE = "Signed out. History stays on this device.";

/** Reads and removes the one-shot `auth_error` / `signin` query parameters. */
function takeUrlNotice(): { error: string | null; code: string | null; signinRequired: boolean } {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("auth_error");
  const error = authErrorMessage(code);
  const signinRequired = url.searchParams.get("signin") === "required";
  if (url.searchParams.has("auth_error") || url.searchParams.has("signin")) {
    url.searchParams.delete("auth_error");
    url.searchParams.delete("signin");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }
  return { error, code, signinRequired };
}

function currentPath(): string {
  const { pathname, search, hash } = window.location;
  return `${pathname}${search}${hash}` || "/";
}

/**
 * Auth state for the header and account page. Identity comes from GET /api/session (verified on the
 * server with `getClaims()`); the browser never decides who is signed in.
 */
export function AuthProvider({ children, onSignedOut }: { children: ReactNode; onSignedOut?: () => void }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [signingIn, setSigningIn] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [notice, setNotice] = useState<AuthNotice | null>(null);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const signedOutRef = useRef(onSignedOut);
  useEffect(() => {
    signedOutRef.current = onSignedOut;
  });

  const apply = useCallback((s: SessionResponse | null) => {
    if (!s) setState({ status: "unknown" });
    else if (!s.configured) setState({ status: "unconfigured" });
    else if (s.user) setState({ status: "signed-in", user: s.user });
    else setState({ status: "signed-out" });
  }, []);

  const refresh = useCallback(
    () =>
      fetchSession().then(
        (s) => apply(s),
        () => apply(null),
      ),
    [apply],
  );

  useEffect(() => {
    // The URL is read once on mount; from then on the notice is state (dismissable, not a timed toast).
    const fromUrl = takeUrlNotice();
    fetchSession()
      .then(
        (s) => apply(s),
        () => apply(null),
      )
      .then(() => {
        if (fromUrl.error)
          setNotice({ kind: "error", message: fromUrl.error, canRetry: fromUrl.code !== "not_configured" });
        else if (fromUrl.signinRequired)
          setNotice({ kind: "signin-required", message: SIGNIN_REQUIRED_MESSAGE, canRetry: true });
      });
  }, [apply]);

  // Coming back to the tab: re-check, so an expired or revoked session shows as signed out.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const signIn = useCallback(() => {
    if (state.status === "unconfigured") {
      toast(AUTH_NOT_CONFIGURED_REASON);
      return;
    }
    setSigningIn(true);
    setNotice(null);
    void signInWithGoogle(currentPath()).then((error) => {
      if (error) {
        setSigningIn(false);
        toast.error(error, { closeButton: true });
      }
      // Otherwise the browser is on its way to Google; keep the loading state.
    });
  }, [state.status]);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    const error = await postSignOut();
    setSigningOut(false);
    if (error) {
      toast.error(error, { closeButton: true });
      await refresh();
      return false;
    }
    setState({ status: "signed-out" });
    toast(SIGNED_OUT_MESSAGE);
    signedOutRef.current?.();
    return true;
  }, [refresh]);

  // Once signed in, a stale "sign in" note has nothing left to ask for.
  const shown = state.status === "signed-in" ? null : notice;
  const value = useMemo<AuthValue>(
    () => ({ state, notice: shown, dismissNotice, signingIn, signingOut, signIn, signOut, refresh }),
    [state, shown, dismissNotice, signingIn, signingOut, signIn, signOut, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}

/** "AL" for "Ada Lovelace", "A" for "ada@example.com". */
export function initials(user: Pick<AuthUser, "name" | "email">): string {
  const source = user.name?.trim() || user.email?.split("@")[0] || "";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.length === 1 ? parts[0].slice(0, 1) : `${parts[0][0]}${parts[parts.length - 1][0]}`;
  return letters.toUpperCase();
}
