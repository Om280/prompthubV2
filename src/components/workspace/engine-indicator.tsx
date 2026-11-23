"use client";

import { Check } from "lucide-react";
import type { Engine, ProviderId } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { engineLabel, cn, PROVIDER_LABELS } from "@/lib/utils";
import { latest } from "@/hooks/use-session";
import { useWorkspace } from "./workspace-context";

type Kind = "preview" | "ai" | "basic" | "loading" | "failed";

/** "Anthropic Claude Sonnet", "OpenAI GPT", "Google Gemini Flash". */
function fullEngineName(provider: Extract<Engine, { kind: "ai" }>["provider"], model: string): string {
  const short = engineLabel({ kind: "ai", provider, model });
  return provider === "anthropic" ? `Anthropic ${short}` : provider === "google" ? `Google ${short}` : short;
}

/** "Anthropic", "Anthropic and OpenAI", "Anthropic, OpenAI and Gemini". */
export function listProviders(ids: ProviderId[]): string {
  const names = ids.map((id) => PROVIDER_LABELS[id]);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The Basic Mode explanation (DESIGN §6.3), honest about keys that exist but aren't usable yet. */
export function basicModeExplanation(detected: ProviderId[]): string {
  if (detected.length > 0) {
    return `API keys found for ${listProviders(detected)}. AI generation isn't connected in this build yet, so prompts come from local templates.`;
  }
  return "No AI provider is set up, so prompts come from local templates. Add ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY to the server environment to turn on AI.";
}

const BODY = "mt-2 text-[14px] leading-[21px] text-fg-muted";

/**
 * Header engine status (DESIGN §6.3). One button at every width: below 640px only the dot shows and
 * the label stays as its accessible name. "Preview data" appears only with the dev mock client.
 */
export function EngineIndicator() {
  const { providers, providersFailed, reloadProviders, preview, basic, state } = useWorkspace();
  const kind: Kind = preview ? "preview" : providers ? (basic ? "basic" : "ai") : providersFailed ? "failed" : "loading";

  // After a fallback the label names the engine that wrote the current result.
  const lastEngine = latest(state)?.engine;
  const resultEngine =
    lastEngine?.kind === "ai" && lastEngine.fellBackFrom?.length ? (lastEngine as Extract<Engine, { kind: "ai" }>) : null;
  const first = providers?.providers[0];
  const label =
    kind === "preview"
      ? "Preview data"
      : kind === "basic"
        ? "Basic Mode, no AI"
        : kind === "loading"
          ? "Checking providers"
          : kind === "failed"
            ? "Engine status unknown"
            : resultEngine
              ? engineLabel(resultEngine)
              : first
                ? engineLabel({ kind: "ai", provider: first.id, model: first.model })
                : "";

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
            {basic && <p className={BODY}>Showing how Basic Mode looks when no AI provider is set up.</p>}
          </>
        )}
        {kind === "basic" && providers && (
          <>
            <p className={BODY}>{basicModeExplanation(providers.detected)}</p>
            <p className={BODY}>
              Templates follow the platform and length you pick, so the same idea and settings always give the same
              prompt. Improve, Shorten, Expand and Tone stay off until AI is on.
            </p>
          </>
        )}
        {kind === "ai" && first && providers && (
          <>
            <p className={BODY}>
              Prompts are written by {fullEngineName(first.id, first.model)}
              {providers.providers.length > 1 &&
                `. Falls back to ${providers.providers
                  .slice(1)
                  .map((p) => PROVIDER_LABELS[p.id])
                  .join(", then ")}`}
              .
            </p>
            <ul className="mt-3 flex flex-col gap-1.5">
              {providers.providers.map((p) => (
                <li key={p.id} className="flex items-center gap-2 type-meta text-fg-muted">
                  <Check className="size-3 text-success" aria-hidden />
                  {p.label} <span className="text-fg-subtle">{p.model}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {kind === "loading" && <p className={BODY}>Checking which providers are set up.</p>}
        {kind === "failed" && (
          <>
            <p className={BODY}>
              PromptHub couldn&apos;t reach the server to check which engine is set up. Generate still works if the
              server is up.
            </p>
            <Button variant="accent" className="-ml-1 mt-2" onClick={reloadProviders}>
              Check again
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
