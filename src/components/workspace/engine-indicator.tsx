"use client";

import { LogIn, Sparkle, Square } from "lucide-react";
import type { AiStatusResponse } from "@/lib/contracts";
import { useAuth } from "@/components/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { engineLabel } from "@/lib/utils";
import { latest } from "@/hooks/use-session";
import { resetLabel, type AiState } from "./ai";
import { useWorkspace } from "./workspace-context";

/** What the indicator shows. `data-engine` keeps these values (e2e reads it). */
type Kind = "ai" | "basic" | "loading" | "failed";

/** Dot styles, one per state (interlock.css `.ih-engine-dot[data-engine]`). */
export type EngineDotKind = Kind | Exclude<AiStatusResponse["ai"]["status"], "ready">;

/** What Basic Mode is. */
export const BASIC_MODE_EXPLANATION =
  "Prompts come from local templates that follow the platform and length you pick, so the same idea and settings always give the same prompt. Nothing is sent to Google.";

export { resetLabel };

/** The status dot: hollow ring for Basic Mode, solid ink when AI is on, danger when AI can't run. */
export function EngineDot({ kind }: { kind: EngineDotKind }) {
  return <span className="ih-engine-dot" data-engine={kind} aria-hidden />;
}

/** "3 of 20 prompts and 5 of 40 refinements left today." */
function UsageLine({ usage }: { usage: NonNullable<AiStatusResponse["usage"]> }) {
  const at = resetLabel(usage.resetsAt);
  return (
    <p data-testid="engine-usage">
      Today: {usage.workflows.remaining} of {usage.workflows.limit} prompts and {usage.refinements.remaining} of{" "}
      {usage.refinements.limit} refinements left{at ? `, resetting ${at}` : ""}.
    </p>
  );
}

/**
 * Engine status (DIRECTION-C §5). One instance on screen: in the top bar from 640px, and inline on
 * phones. The popover says what writes the prompts, offers the switch between Gemini and Basic Mode
 * when AI is ready, and sign-in when AI needs it.
 */
export function EngineIndicator({
  placement = "topbar",
  compact = false,
}: {
  placement?: "topbar" | "inline";
  /** Dot only, with the label as its name (the phone sheet header, where provenance says it in full). */
  compact?: boolean;
} = {}) {
  const { aiStatus, aiStatusFailed, reloadAiStatus, aiState, setEnginePref, state } = useWorkspace();
  const auth = useAuth();
  const kind: Kind = aiStatus ? (aiState === "on" ? "ai" : "basic") : aiStatusFailed ? "failed" : "loading";
  const ai = aiStatus?.ai;
  const dot: EngineDotKind =
    kind === "basic" && ai && ai.status !== "ready" ? ai.status : kind;

  // With AI on, the label names the model that wrote the current result, or the configured one.
  const lastEngine = latest(state)?.engine;
  const label =
    kind === "basic"
      ? "Basic Mode, no AI"
      : kind === "loading"
        ? "Checking engine"
        : kind === "failed"
          ? "Engine status unknown"
          : lastEngine?.kind === "ai"
            ? engineLabel(lastEngine)
            : ai?.model
              ? engineLabel({ kind: "ai", provider: "gemini", tier: "free", model: ai.model })
              : "Gemini (free tier)";

  return (
    // Opening re-checks the status, so today's allowance is current.
    <Popover onOpenChange={(open) => open && aiStatus && reloadAiStatus()}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="engine-indicator"
          data-engine={kind}
          data-ai-status={ai?.status}
          data-placement={placement}
          data-compact={compact || undefined}
          aria-label={compact ? label : undefined}
          className="ih-engine"
        >
          <EngineDot kind={dot} />
          {!compact && <span>{label}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align={placement === "topbar" ? "end" : "start"} data-testid="engine-popover">
        <strong className="ih-popover-title">{label}</strong>
        {aiStatus && <EngineDetails state={aiState} status={aiStatus} />}
        {kind === "loading" && <p>Checking which engine is available.</p>}
        {kind === "failed" && (
          <>
            <p>
              PromptHub couldn&apos;t reach the server to check which engine is set up. Basic Mode still works if the
              server is up.
            </p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={reloadAiStatus}>
              Check again
            </Button>
          </>
        )}
        {aiState === "on" && (
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => setEnginePref("basic")}>
            <Square size={13} aria-hidden />
            Use Basic Mode
          </Button>
        )}
        {aiState === "chosen-basic" && (
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => setEnginePref("auto")}>
            <Sparkle size={14} aria-hidden />
            Use Gemini
          </Button>
        )}
        {aiState === "sign-in-required" && auth.state.status === "signed-out" && (
          <Button variant="secondary" size="sm" className="mt-3" onClick={auth.signIn}>
            <LogIn size={15} aria-hidden />
            Sign in with Google
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function EngineDetails({ state, status }: { state: AiState; status: AiStatusResponse }) {
  const ai = status.ai;
  switch (state) {
    case "on":
      return (
        <>
          <p>
            Prompts are written by Google Gemini ({ai.model}) on its free tier, for the platform you pick. On the free
            tier, Google may use what you send to improve its products.
          </p>
          {status.usage && <UsageLine usage={status.usage} />}
        </>
      );
    case "chosen-basic":
      return (
        <>
          <p>{BASIC_MODE_EXPLANATION}</p>
          <p>You chose Basic Mode. Gemini is available, so you can switch back any time.</p>
          {status.usage && <UsageLine usage={status.usage} />}
        </>
      );
    case "sign-in-required":
      return (
        <>
          <p>{BASIC_MODE_EXPLANATION}</p>
          <p>Sign in with Google to have Gemini write and refine your prompts. Basic Mode works without an account.</p>
        </>
      );
    case "quota-exhausted": {
      const at = resetLabel(ai.resetsAt);
      return (
        <>
          <p>{BASIC_MODE_EXPLANATION}</p>
          <p>
            {ai.message}
            {at ? ` AI is available again ${at}, your time.` : ""}
          </p>
        </>
      );
    }
    default:
      return (
        <>
          <p>{BASIC_MODE_EXPLANATION}</p>
          <p>{ai.message}</p>
        </>
      );
  }
}
