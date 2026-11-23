import {
  schemas,
  type ApiError,
  type ClarifyRequest,
  type ClarifyResponse,
  type GenerateRequest,
  type ProvidersResponse,
  type StreamEvent,
  type TransformRequest,
} from "@/lib/contracts";
import { readEventStream, UNREADABLE_MESSAGE } from "./ndjson";
import { ClientError, isAbortError, type PromptHubClient } from "./types";

/* User-facing copy for errors the server did not describe (DESIGN §6.11, §8). */
export const ERROR_COPY = {
  provider: "No provider could complete this request. Try again in a minute.",
  rateLimited: "Too many requests. Wait a minute and try again.",
  network: "Couldn't reach PromptHub. Check your connection and try again.",
  ideaTooLong: "Ideas can be up to 4,000 characters.",
  promptTooLong: "This prompt is over 20,000 characters. Shorten it to keep editing.",
  invalid: "This request couldn't be sent as it is. Check the idea and try again.",
  aiRequired:
    "Improve, Shorten, Expand and Tone need an AI provider. Add an API key to the server to turn them on.",
  internal: "Something went wrong on the server. Try again in a minute.",
} as const;

type Route = "providers" | "clarify" | "generate" | "transform";

export interface ApiClientOptions {
  /** Injected for tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Prefix for the routes, "" for same-origin. */
  baseUrl?: string;
}

function retryAfter(res: Response): number | undefined {
  const h = res.headers.get("retry-after");
  if (!h) return undefined;
  const n = Number(h);
  if (Number.isFinite(n) && n >= 0) return Math.round(n);
  const date = Date.parse(h);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.round((date - Date.now()) / 1000));
}

/** The error to show when the body did not carry a valid `{ error }`. */
export function fallbackError(status: number, route: Route): ApiError {
  if (status === 413) {
    return { code: "invalid_request", message: route === "transform" ? ERROR_COPY.promptTooLong : ERROR_COPY.ideaTooLong };
  }
  if (status === 400 || status === 422) return { code: "invalid_request", message: ERROR_COPY.invalid };
  if (status === 409) return { code: "ai_required", message: ERROR_COPY.aiRequired };
  if (status === 429) return { code: "rate_limited", message: ERROR_COPY.rateLimited };
  if (status === 502 || status === 503 || status === 504) return { code: "provider_unavailable", message: ERROR_COPY.provider };
  return { code: "internal", message: ERROR_COPY.internal };
}

/** Reads a non-2xx response into an ApiError: the server's `{ error }` when valid, else by status. */
export async function errorFromResponse(res: Response, route: Route): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const parsed = schemas.ApiError.safeParse((body as { error?: unknown } | null)?.error);
  const base = fallbackError(res.status, route);
  const error: ApiError = parsed.success && parsed.data.message.trim() ? parsed.data : base;
  // A 413 from a proxy or the body limit never has a useful message; keep ours.
  if (res.status === 413 && !parsed.success) return base;
  if (error.code === "rate_limited" && error.retryAfterSec === undefined) {
    const s = retryAfter(res);
    if (s !== undefined) return { ...error, retryAfterSec: s };
  }
  return error;
}

const NETWORK_ERROR: ApiError = { code: "internal", message: ERROR_COPY.network };
const abortError = () => new DOMException("Aborted", "AbortError");

/**
 * The real client over same-origin fetch (API_CONTRACTS §2–5). JSON routes throw `ClientError`;
 * streaming routes never throw: failures arrive as one terminal `error` event, and an abort ends the
 * iteration with no event.
 */
export function createApiClient(options: ApiClientOptions = {}): PromptHubClient {
  const doFetch: typeof fetch = options.fetch ?? ((...args) => fetch(...args));
  const base = options.baseUrl ?? "";

  async function request(route: Route, init: RequestInit): Promise<Response> {
    try {
      return await doFetch(`${base}/api/${route}`, init);
    } catch (e) {
      if (init.signal?.aborted || isAbortError(e)) throw abortError();
      throw new ClientError(NETWORK_ERROR);
    }
  }

  async function json<T>(
    route: Route,
    init: RequestInit,
    schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } },
  ): Promise<T> {
    const res = await request(route, init);
    if (!res.ok) throw new ClientError(await errorFromResponse(res, route));
    let body: unknown;
    try {
      body = await res.json();
    } catch (e) {
      if (init.signal?.aborted || isAbortError(e)) throw abortError();
      throw new ClientError({ code: "internal", message: UNREADABLE_MESSAGE });
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ClientError({ code: "internal", message: UNREADABLE_MESSAGE });
    return parsed.data;
  }

  async function* stream(route: "generate" | "transform", payload: unknown, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
    let res: Response;
    try {
      res = await request(route, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/x-ndjson" },
        body: JSON.stringify(payload),
        signal,
      });
    } catch (e) {
      if (signal?.aborted || isAbortError(e)) return;
      yield { type: "error", error: e instanceof ClientError ? e.error : NETWORK_ERROR };
      return;
    }
    if (!res.ok) {
      const error = await errorFromResponse(res, route);
      if (signal?.aborted) return;
      yield { type: "error", error };
      return;
    }
    if (!res.body) {
      yield { type: "error", error: { code: "internal", message: UNREADABLE_MESSAGE } };
      return;
    }
    yield* readEventStream(res.body, signal);
  }

  const post = (body: unknown, signal?: AbortSignal): RequestInit => ({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  return {
    kind: "api",
    getProviders(): Promise<ProvidersResponse> {
      return json("providers", { method: "GET", cache: "no-store" }, schemas.ProvidersResponse);
    },
    clarify(req: ClarifyRequest, signal?: AbortSignal): Promise<ClarifyResponse> {
      return json("clarify", post(req, signal), schemas.ClarifyResponse);
    },
    generate(req: GenerateRequest, signal?: AbortSignal) {
      return stream("generate", req, signal);
    },
    transform(req: TransformRequest, signal?: AbortSignal) {
      return stream("transform", req, signal);
    },
  };
}
