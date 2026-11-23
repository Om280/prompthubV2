/**
 * The one server error logger. Server-only. Everything it prints passes through `redact()`, so a
 * user's OpenRouter key or a bearer token that ends up in an error message is masked. It logs a short
 * description (name and message), never request bodies, headers or stack traces with locals.
 */
import { redact } from "./redact";

export function describeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (typeof err === "string") return err;
  return typeof err;
}

export function logServerError(label: string, err: unknown): void {
  console.error(redact(`[prompthub] ${label}: ${describeError(err)}`));
}
