/**
 * Provider registry (ARCHITECTURE §5). Server-only.
 *
 * Phase 2 ships no adapters, so `providers` is always empty and the app runs in Basic Mode.
 * `detected` lists providers whose key is present, so the UI can say "keys found, AI not connected in
 * this build" instead of "no key set". Phase 3 fills `ADAPTER_FACTORIES`; callers don't change.
 */
import type { ProviderId, ProvidersResponse } from "@/lib/contracts";
import { readServerEnv, type ServerEnv } from "@/lib/server/env";

export interface ProviderAdapter {
  id: ProviderId;
  /** "OpenAI", "Anthropic", "Google Gemini" */
  label: string;
  /** Resolved model id (env override or verified default). */
  model: string;
  /** Phase 3 narrows this to the AI SDK `LanguageModel`; typed loosely so Phase 2 needs no `ai` package. */
  languageModel(): unknown;
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google Gemini",
};

/**
 * Builds an adapter for a provider whose key is present. Phase 3 adds one factory per provider; each
 * reads its own key from `process.env` inside the factory, so key values never pass through here.
 */
type AdapterFactory = () => ProviderAdapter;
const ADAPTER_FACTORIES: Partial<Record<ProviderId, AdapterFactory>> = {};

export interface Registry {
  /** Usable providers in fallback order. Empty → Basic Mode. */
  providers: ProviderAdapter[];
  /** Providers with a key present but no adapter in this build. */
  detected: ProviderId[];
}

export function buildRegistry(env: ServerEnv = readServerEnv()): Registry {
  const providers: ProviderAdapter[] = [];
  const detected: ProviderId[] = [];
  for (const id of env.providerOrder) {
    if (!env.keys[id]) continue;
    const factory = ADAPTER_FACTORIES[id];
    if (factory) providers.push(factory());
    else detected.push(id);
  }
  return { providers, detected };
}

export function providersResponse(registry: Registry): ProvidersResponse {
  return {
    mode: registry.providers.length > 0 ? "ai" : "basic",
    providers: registry.providers.map((p) => ({ id: p.id, label: p.label, model: p.model })),
    default: registry.providers[0]?.id ?? null,
    detected: registry.detected,
  };
}
