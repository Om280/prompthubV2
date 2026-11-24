"use client";

import { LogIn, RotateCcw, Square } from "lucide-react";
import type { ApiErrorCode } from "@/lib/contracts";
import { useAuth } from "@/components/auth/auth-context";
import { Button } from "@/components/ui/button";
import { latest, type SessionError } from "@/hooks/use-session";
import { LIMIT_CODES, resetLabel } from "./ai";
import { useWorkspace } from "./workspace-context";

/** Errors where an immediate retry can't help: a limit, a missing provider, or a sign-in. */
const NO_RETRY: ReadonlySet<ApiErrorCode> = new Set([
  "ai_required",
  "auth_required",
  "user_daily_limit",
  "daily_budget_exhausted",
]);

export const canRetry = (code?: ApiErrorCode) => !code || !NO_RETRY.has(code);

/** Activities that Basic Mode can run too (transforms can't). */
const basicCanRun = (e: SessionError) => e.retry === "clarify" || e.retry === "generate" || e.retry === "regenerate";

/**
 * What went wrong and the one or two things that help (DIRECTION-C error states):
 * - an AI limit: when it is available again, in the visitor's time, and "Use Basic Mode";
 * - a sign-in: "Sign in with Google";
 * - a stream that broke or was cut off: what was kept, and "Try again".
 * The draft and every version stay as they are.
 */
export function ErrorStrip({ error, prominent = false }: { error: SessionError; prominent?: boolean }) {
  const { state, actions, setEnginePref, aiState } = useWorkspace();
  const auth = useAuth();
  const limit = error.code !== undefined && LIMIT_CODES.has(error.code);
  const at = limit ? resetLabel(error.resetsAt) : null;
  const last = latest(state);
  const keptPartial = !!last?.partial && state.versions.length > 0;

  const useBasic = () => {
    setEnginePref("basic");
    // Clarify and generate can carry on right away in Basic Mode; a refinement just stays put.
    if (basicCanRun(error)) actions.retry();
  };

  return (
    <div className="ih-strip ih-error-strip" data-tone="danger" role="alert" data-code={error.code}>
      <div className="ih-error-text">
        <span>{error.message}</span>
        {at && <span className="ih-error-meta">AI is available again {at}, your time.</span>}
        {keptPartial && (
          <span className="ih-error-meta">
            What arrived is kept as version {state.versions.length}, marked partial.
          </span>
        )}
      </div>
      <div className="ih-error-actions">
        {error.code === "auth_required" && auth.state.status !== "signed-in" && (
          <Button variant={prominent ? "primary" : "secondary"} size="sm" onClick={auth.signIn}>
            <LogIn size={15} aria-hidden />
            Sign in with Google
          </Button>
        )}
        {limit && aiState !== "chosen-basic" && (
          <Button variant={prominent ? "primary" : "secondary"} size="sm" onClick={useBasic}>
            <Square size={13} aria-hidden />
            Use Basic Mode
          </Button>
        )}
        {canRetry(error.code) && (
          <Button variant={prominent && !limit ? "primary" : "secondary"} size="sm" onClick={actions.retry}>
            <RotateCcw size={14} aria-hidden />
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}
