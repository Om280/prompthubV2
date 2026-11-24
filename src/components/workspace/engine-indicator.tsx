"use client";

import { LogIn } from "lucide-react";
import type { AiStatusResponse } from "@/lib/contracts";
import { useAuth } from "@/components/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { engineLabel } from "@/lib/utils";
import { latest } from "@/hooks/use-session";
import { useWorkspace } from "./workspace-context";

/** What the indicator shows. `data-engine` keeps these values (e2e and the dev preview read it). */
type Kind = "preview" | "ai" | "basic" | "loading" | "failed";

/** Dot styles, one per AI status (interlock.css `.ih-engine-dot[data-engine]`). */
export type EngineDotKind = Kind | Exclude<AiStatusResponse["ai"]["status"], "ready">;

/** What Basic Mode is. */
export const BASIC_MODE_EXPLANATION =
  "Prompts come from local templates that follow the platform and length you pick, so the same idea and settings always give the same prompt.";

/**
 * How AI will work, honest about this build: Google Gemini on its free tier, for signed-in users,
 * coming in a later update. The server's own status message explains a configuration problem.
 */
export function aiPlanExplanation(status: AiStatusResponse | null): string {
  const base =
    "AI will use Google Gemini on its free tier after you sign in with Google. On the free tier, Google may use what you send to improve its products. It's coming in a later update.";
  if (status?.ai.status === "not-configured") return `${base} ${status.ai.message}`;
  if (status && !status.auth.configured) return `${base} Sign-in isn't set up on this server yet.`;
  return base;
}

/** "at 12:00 AM" today, or "Tue at 12:00 AM", in the visitor's own time zone. */
export function resetLabel(iso: string | undefined, now = new Date()): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const time = at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const sameDay = at.toDateString() === now.toDateString();
  return sameDay ? `at ${time}` : `${at.toLocaleDateString(undefined, { weekday: "short" })} at ${time}`;
}

/** The status dot: hollow ring for Basic Mode, solid ink when AI is on, danger when AI can't run. */
export function EngineDot({ kind }: { kind: EngineDotKind }) {
  return <span className="ih-engine-dot" data-engine={kind} aria-hidden />;
}

/**
 * Engine status (DIRECTION-C §5). One instance on screen: in the top bar from 640px, and inline on
 * phones (under the composer, or in the prompt sheet header). "Preview data" appears only with the
 * dev mock client.
 */
export function EngineIndicator({ placement = "topbar" }: { placement?: "topbar" | "inline" } = {}) {
  const { aiStatus, aiStatusFailed, reloadAiStatus, preview, basic, state } = useWorkspace();
  const auth = useAuth();
  const kind: Kind = preview ? "preview" : aiStatus ? (basic ? "basic" : "ai") : aiStatusFailed ? "failed" : "loading";
  const ai = aiStatus?.ai;
  const dot: EngineDotKind = kind === "basic" && ai && ai.status !== "ready" ? ai.status : kind;

  // In AI mode the label names the model that wrote the current result, when there is one.
  const lastEngine = latest(state)?.engine;
  const resultEngine = lastEngine?.kind === "ai" ? lastEngine : null;
  const label =
    kind === "preview"
      ? "Preview data"
      : kind === "basic"
        ? "Basic Mode, no AI"
        : kind === "loading"
          ? "Checking engine"
          : kind === "failed"
            ? "Engine status unknown"
            : resultEngine
              ? engineLabel(resultEngine)
              : ai?.model
                ? engineLabel({ kind: "ai", provider: "gemini", tier: "free", model: ai.model })
                : "Gemini (free tier)";

  const resets = ai?.status === "quota-exhausted" ? resetLabel(ai.resetsAt) : null;
  const canSignIn = ai?.status === "sign-in-required" && auth.state.status === "signed-out";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="engine-indicator"
          data-engine={kind}
          data-ai-status={ai?.status}
          data-placement={placement}
          className="ih-engine"
        >
          <EngineDot kind={dot} />
          <span>{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align={placement === "topbar" ? "end" : "start"}>
        <strong className="ih-popover-title">{label}</strong>
        {kind === "preview" && (
          <>
            <p>This view uses sample data from the dev preview, not the server.</p>
            <p>Prompts here are rendered from local sample briefs, not written by AI. History lives in this tab only.</p>
            {basic && <p>Showing how Basic Mode looks.</p>}
          </>
        )}
        {kind === "basic" && aiStatus && (
          <>
            <p>{BASIC_MODE_EXPLANATION}</p>
            {ai?.status === "sign-in-required" || ai?.status === "quota-exhausted" ? (
              <p>{ai.message}</p>
            ) : (
              <p>{aiPlanExplanation(aiStatus)}</p>
            )}
            {resets && <p>The free daily allowance resets {resets}, your time.</p>}
            <p>Improve, Shorten, Expand and Tone stay off until AI is on.</p>
            {canSignIn && (
              <Button variant="secondary" size="sm" className="mt-3" onClick={auth.signIn}>
                <LogIn size={15} aria-hidden />
                Sign in with Google
              </Button>
            )}
          </>
        )}
        {kind === "ai" && ai && <p>{ai.message}</p>}
        {kind === "loading" && <p>Checking which engine is available.</p>}
        {kind === "failed" && (
          <>
            <p>
              PromptHub couldn&apos;t reach the server to check which engine is set up. Generate still works if the
              server is up.
            </p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={reloadAiStatus}>
              Check again
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
