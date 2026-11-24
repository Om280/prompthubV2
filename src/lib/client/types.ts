import type {
  ApiError,
  ClarifyRequest,
  ClarifyResponse,
  GenerateRequest,
  AiStatusResponse,
  StreamEvent,
  TransformRequest,
} from "@/lib/contracts";

/**
 * The client-side API surface the UI talks to.
 * Phase 1 ships `mockClient` (src/lib/mock/adapter.ts); Phase 2 adds `api.ts` with the same shape,
 * backed by fetch + the NDJSON reader. The UI never imports either directly, only this interface
 * through `ClientProvider`.
 */
export interface PromptHubClient {
  /**
   * "mock" while generation is not connected. The UI shows the "Preview data" indicator for it and
   * never labels its output as written by an AI provider.
   */
  readonly kind: "mock" | "api";
  /** GET /api/providers: AI availability and auth status. */
  getAiStatus(): Promise<AiStatusResponse>;
  clarify(req: ClarifyRequest, signal?: AbortSignal): Promise<ClarifyResponse>;
  /** Yields `meta`, then `delta`*, then exactly one `done` or `error`. Stops early when aborted. */
  generate(req: GenerateRequest, signal?: AbortSignal): AsyncIterable<StreamEvent>;
  transform(req: TransformRequest, signal?: AbortSignal): AsyncIterable<StreamEvent>;
  /**
   * Optional (the real client has it). "basic" makes clarify/generate use Basic Mode even when AI is
   * ready, e.g. after a quota error; "auto" (default) uses AI whenever the last status said so.
   */
  setEnginePreference?(preference: "auto" | "basic"): void;
  /** Optional: the engine the next clarify/generate will ask for. */
  readonly engine?: "ai" | "basic";
}

/** Thrown by `clarify` (and surfaced as an `error` event by streams) when a request fails. */
export class ClientError extends Error {
  constructor(
    readonly error: ApiError,
  ) {
    super(error.message);
    this.name = "ClientError";
  }
}

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException ? e.name === "AbortError" : (e as { name?: string })?.name === "AbortError";
}
