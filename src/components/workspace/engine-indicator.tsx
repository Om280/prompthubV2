"use client";

import { Check } from "lucide-react";
import type { Engine, ProviderId } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { engineLabel, PROVIDER_LABELS } from "@/lib/utils";
import { latest } from "@/hooks/use-session";
import { useWorkspace } from "./workspace-context";

/**
 * States the indicator can show. The last four are for the Gemini engine work that comes later;
 * their dots are styled already (interlock.css), but nothing sets them until that data exists.
 */
export type EngineKind =
  | "preview"
  | "ai"
  | "basic"
  | "loading"
  | "failed"
  | "sign-in-required"
  | "quota-exhausted"
  | "not-configured"
  | "unavailable";

/** The status dot: hollow ring for Basic Mode, solid ink when AI is on, danger when it can't run. */
export function EngineDot({ kind }: { kind: EngineKind }) {
  return <span className="ih-engine-dot" data-engine={kind} aria-hidden />;
}

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

/** The Basic Mode explanation, honest about keys that exist but aren't usable yet. */
export function basicModeExplanation(detected: ProviderId[]): string {
  if (detected.length > 0) {
    return `API keys found for ${listProviders(detected)}. AI generation isn't connected in this build yet, so prompts come from local templates.`;
  }
  return "No AI provider is set up, so prompts come from local templates. Add ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY to the server environment to turn on AI.";
}

/**
 * Engine status (DIRECTION-C §5). One instance on screen: in the top bar from 640px, and inline on
 * phones (under the composer, or in the prompt sheet header). "Preview data" appears only with the
 * dev mock client.
 */
export function EngineIndicator({ placement = "topbar" }: { placement?: "topbar" | "inline" } = {}) {
  const { providers, providersFailed, reloadProviders, preview, basic, state } = useWorkspace();
  const kind: EngineKind = preview
    ? "preview"
    : providers
      ? basic
        ? "basic"
        : "ai"
      : providersFailed
        ? "failed"
        : "loading";

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

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="engine-indicator"
          data-engine={kind}
          data-placement={placement}
          className="ih-engine"
        >
          <EngineDot kind={kind} />
          <span>{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align={placement === "topbar" ? "end" : "start"}>
        <strong className="ih-popover-title">{label}</strong>
        {kind === "preview" && (
          <>
            <p>This view uses sample data from the dev preview, not the server.</p>
            <p>Prompts here are rendered from local sample briefs, not written by AI. History lives in this tab only.</p>
            {basic && <p>Showing how Basic Mode looks when no AI provider is set up.</p>}
          </>
        )}
        {kind === "basic" && providers && (
          <>
            <p>{basicModeExplanation(providers.detected)}</p>
            <p>
              Templates follow the platform and length you pick, so the same idea and settings always give the same
              prompt. Improve, Shorten, Expand and Tone stay off until AI is on.
            </p>
          </>
        )}
        {kind === "ai" && first && providers && (
          <>
            <p>
              Prompts are written by {fullEngineName(first.id, first.model)}
              {providers.providers.length > 1 &&
                `. Falls back to ${providers.providers
                  .slice(1)
                  .map((p) => PROVIDER_LABELS[p.id])
                  .join(", then ")}`}
              .
            </p>
            <ul>
              {providers.providers.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <Check size={13} aria-hidden />
                  {p.label} <span className="ih-hint">{p.model}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {kind === "loading" && <p>Checking which providers are set up.</p>}
        {kind === "failed" && (
          <>
            <p>
              PromptHub couldn&apos;t reach the server to check which engine is set up. Generate still works if the
              server is up.
            </p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={reloadProviders}>
              Check again
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
