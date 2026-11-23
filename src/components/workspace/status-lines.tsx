"use client";

import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/use-history";
import { formatCount, relativeLong, wordCount } from "@/lib/utils";
import type { ApiErrorCode } from "@/lib/contracts";
import { BASIC_REASON, provenance, SAME_PROMPT_NOTE, versionLabel } from "./labels";

/** `ai_required` can't succeed on retry; the action needs a provider first. */
const canRetry = (code?: ApiErrorCode) => code !== "ai_required";
import { useWorkspace } from "./workspace-context";

/** Lines between the toolbar and the editor: Basic Mode reason, inline error, old-version banner, notices. */
export function StatusLines() {
  const { state, actions, basic } = useWorkspace();
  const hasVersions = state.versions.length > 0;
  const viewing = state.viewing !== null ? state.versions[state.viewing] : undefined;

  return (
    <div className="flex flex-col gap-2 empty:hidden">
      {basic && hasVersions && <p className="mt-2 type-meta text-fg-subtle">{BASIC_REASON}</p>}

      {state.phase === "error" && state.error && hasVersions && (
        <p className="mt-2 flex flex-wrap items-center gap-x-3 type-ui text-danger" role="alert">
          <span>{state.error.message}</span>
          {canRetry(state.error.code) && (
            <Button variant="accent" className="-ml-1" onClick={actions.retry}>
              Try again
            </Button>
          )}
        </p>
      )}

      {viewing && state.viewing !== null && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="type-ui text-fg-muted">
            Viewing version {state.viewing + 1}, {versionLabel(viewing)}.
          </p>
          <div className="flex items-center gap-3">
            <Button variant="accent" className="-ml-1" onClick={actions.restore}>
              Restore this version
            </Button>
            <Button variant="text" onClick={() => actions.dispatch({ type: "viewVersion", index: null })}>
              Back to latest
            </Button>
          </div>
        </div>
      )}

      {state.notice?.kind === "stopped" && (
        <p className="mt-2 type-meta text-fg-subtle" role="status">
          Stopped. Kept what was written so far.
        </p>
      )}
      {state.notice?.kind === "same" && (
        <p className="mt-2 type-meta text-fg-subtle" role="status">
          {SAME_PROMPT_NOTE}
        </p>
      )}
      {state.notice?.kind === "restored" && (
        <p className="mt-2 type-meta text-fg-subtle" role="status">
          Restored as version {state.notice.version}
        </p>
      )}
    </div>
  );
}

/** Inline error when nothing has been written yet (clarify or first generation failed). */
export function FirstRunError() {
  const { state, actions } = useWorkspace();
  if (state.phase !== "error" || !state.error || state.versions.length > 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-3 type-ui text-danger" role="alert">
      <span>{state.error.message}</span>
      {canRetry(state.error.code) && (
        <Button variant="accent" className="-ml-1" onClick={actions.retry}>
          Try again
        </Button>
      )}
    </p>
  );
}

/** "Written by …   Edited 2 min ago   312 words" (DESIGN §6.5). */
export function Provenance() {
  const { state, preview } = useWorkspace();
  const now = useNow();
  if (state.versions.length === 0 || state.stream) return null;
  const shown = state.viewing !== null ? state.versions.slice(0, state.viewing + 1) : state.versions;
  const author = [...shown].reverse().find((v) => v.engine.kind !== "manual");
  const lastEdit = [...shown].reverse().find((v) => v.source === "edited");
  const text = state.viewing !== null ? shown[shown.length - 1].content : state.draft;
  const words = wordCount(text);
  const saved = state.notice?.kind === "saved" ? state.notice.version : null;

  return (
    <p className="mt-6 flex flex-wrap gap-x-4 gap-y-1 type-meta text-fg-subtle tabular-nums">
      {author && <span>{provenance(author.engine as Exclude<typeof author.engine, { kind: "manual" }>, preview)}</span>}
      {saved !== null ? (
        <span role="status">Saved as version {saved}</span>
      ) : (
        lastEdit && <span>Edited {relativeLong(lastEdit.createdAt, now)}</span>
      )}
      <span>{words === 1 ? "1 word" : `${formatCount(words)} words`}</span>
    </p>
  );
}

