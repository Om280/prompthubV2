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
 * The client-side API surface the UI talks to: `createApiClient` (api.ts), over same-origin fetch and
 * the NDJSON reader. Tests may pass any object with this shape.
 */
export interface PromptHubClient {
  readonly kind: "api";
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
