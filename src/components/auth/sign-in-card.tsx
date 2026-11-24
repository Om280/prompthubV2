"use client";

import { LoaderCircle, LogIn, X } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/hooks/use-media";
import { useAuth } from "./auth-context";

const EASE = [0.23, 1, 0.32, 1] as const;

/**
 * The sign-in surface: shown above the work when a sign-in failed or was cancelled
 * (`/?auth_error=…`), or when a page needed an account (`/?signin=required`). It says what happened
 * and offers the one thing that helps, signing in again. Basic Mode keeps working underneath.
 */
export function SignInCard() {
  const { notice, dismissNotice, signIn, signingIn, state } = useAuth();
  const reduced = useReducedMotion();
  if (!notice) return null;
  const error = notice.kind === "error";
  const canSignIn = notice.canRetry && state.status !== "unconfigured";

  return (
    <motion.section
      className="ih-auth-card"
      data-kind={notice.kind}
      role={error ? "alert" : "status"}
      aria-labelledby="auth-card-title"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: EASE }}
    >
      <div className="ih-auth-card-text">
        <h2 id="auth-card-title" className="ih-auth-card-title">
          {error ? "Google sign-in" : "Sign in to continue"}
        </h2>
        <p>{notice.message}</p>
        {!error && <p className="ih-hint">Basic Mode works without an account. Your history stays on this device.</p>}
      </div>
      <div className="ih-auth-card-actions">
        {canSignIn && (
          <Button variant="secondary" size="sm" aria-disabled={signingIn ? true : undefined} onClick={signIn}>
            {signingIn ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <LogIn size={15} aria-hidden />}
            {signingIn ? "Signing in" : "Sign in with Google"}
          </Button>
        )}
        <Button size="sm" icon aria-label="Dismiss" onClick={dismissNotice}>
          <X size={16} aria-hidden />
        </Button>
      </div>
    </motion.section>
  );
}
