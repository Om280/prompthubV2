/**
 * Cancellation hooks for AI calls. Server-only.
 *
 * The future Gemini call takes `aiCallSignal(request.signal, AI_TIMEOUT_MS)`: it aborts when the
 * client goes away or when the timeout passes, whichever comes first. No call exists yet; this is the
 * hook the AI integration phase plugs into.
 */
// import "server-only" is added once the Vitest alias for it exists (see the Gemini report).

export class AiTimeoutError extends Error {
  constructor(ms: number) {
    super(`AI request timed out after ${ms} ms`);
    this.name = "TimeoutError";
  }
}

export function aiCallSignal(clientSignal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return clientSignal ? AbortSignal.any([clientSignal, timeout]) : timeout;
}

/** Whether a signal ended because of the timeout (not the client). */
export function isTimeout(signal: AbortSignal): boolean {
  const reason = signal.reason as { name?: string } | undefined;
  return signal.aborted && reason?.name === "TimeoutError";
}
