"use client";

import type { AiStatusResponse } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { engineLabel, cn } from "@/lib/utils";
import { latest } from "@/hooks/use-session";
import { useWorkspace } from "./workspace-context";

type Kind = "preview" | "ai" | "basic" | "loading" | "failed";

/** What Basic Mode is (DESIGN §6.3). */
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

const BODY = "mt-2 text-[14px] leading-[21px] text-fg-muted";

/**
 * Header engine status (DESIGN §6.3). One button at every width: below 640px only the dot shows and
 * the label stays as its accessible name. "Preview data" appears only with the dev mock client.
 */
export function EngineIndicator() {
  const { aiStatus, aiStatusFailed, reloadAiStatus, preview, basic, state } = useWorkspace();
  const kind: Kind = preview ? "preview" : aiStatus ? (basic ? "basic" : "ai") : aiStatusFailed ? "failed" : "loading";

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
              : aiStatus?.ai.model
                ? engineLabel({ kind: "ai", provider: "gemini", tier: "free", model: aiStatus.ai.model })
                : "Gemini (free tier)";

  const dot = (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        kind === "ai" && "bg-success",
        kind === "basic" && "shadow-[inset_0_0_0_1px_var(--color-fg-subtle)]",
        kind === "preview" && "bg-fg-subtle",
        (kind === "loading" || kind === "failed") && "bg-border-control",
      )}
    />
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="engine-indicator"
          data-engine={kind}
          className={cn(
            "press flex h-8 items-center gap-2 rounded-sm px-2 type-meta text-fg-muted hover:bg-surface-2 hover:text-fg coarse:h-11",
            "max-sm:w-11 max-sm:justify-center max-sm:px-0",
          )}
        >
          {dot}
          <span className="whitespace-nowrap max-sm:sr-only">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px]">
        <p className="type-ui text-fg">{label}</p>
        {kind === "preview" && (
          <>
            <p className={BODY}>This view uses sample data from the dev preview, not the server.</p>
            <p className={BODY}>
              Prompts here are rendered from local sample briefs, not written by AI. History lives in this tab only.
            </p>
            {basic && <p className={BODY}>Showing how Basic Mode looks.</p>}
          </>
        )}
        {kind === "basic" && aiStatus && (
          <>
            <p className={BODY}>{BASIC_MODE_EXPLANATION}</p>
            <p className={BODY}>{aiPlanExplanation(aiStatus)}</p>
            <p className={BODY}>Improve, Shorten, Expand and Tone stay off until AI is on.</p>
          </>
        )}
        {kind === "ai" && aiStatus && <p className={BODY}>{aiStatus.ai.message}</p>}
        {kind === "loading" && <p className={BODY}>Checking which engine is available.</p>}
        {kind === "failed" && (
          <>
            <p className={BODY}>
              PromptHub couldn&apos;t reach the server to check which engine is set up. Generate still works if the
              server is up.
            </p>
            <Button variant="accent" className="-ml-1 mt-2" onClick={reloadAiStatus}>
              Check again
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
