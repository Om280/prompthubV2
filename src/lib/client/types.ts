import type {
  ApiError,
  ClarifyRequest,
  ClarifyResponse,
  GenerateRequest,
  ProvidersResponse,
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
  getProviders(): Promise<ProvidersResponse>;
  clarify(req: ClarifyRequest, signal?: AbortSignal): Promise<ClarifyResponse>;
  /** Yields `meta`, then `delta`*, then exactly one `done` or `error`. Stops early when aborted. */
  generate(req: GenerateRequest, signal?: AbortSignal): AsyncIterable<StreamEvent>;
  transform(req: TransformRequest, signal?: AbortSignal): AsyncIterable<StreamEvent>;
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
