"use client";

import { useEffect, useMemo, useRef } from "react";
import { useReducedMotion } from "@/hooks/use-media";
import { latest } from "@/hooks/use-session";
import { cn } from "@/lib/utils";
import { TINT_CLASS, tokenizeAnatomy } from "./anatomy";
import { useWorkspace } from "./workspace-context";

const IDLE_COMMIT_MS = 1500;
export const MAX_PROMPT_CHARS = 20000;

/**
 * Plain textarea over an identical-metrics tint layer (DESIGN §6.5). The textarea text is
 * transparent with a visible caret; the layer behind it paints the anatomy colors. What you copy
 * is exactly the textarea value.
 */
export function Editor() {
  const { state, actions, editorRef, washRef } = useWorkspace();
  const reduced = useReducedMotion();
  const tintRef = useRef<HTMLDivElement>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stream = state.stream;
  const viewingVersion = state.viewing !== null ? state.versions[state.viewing] : undefined;
  const hasVersions = state.versions.length > 0;

  // While a stream has not produced text yet, keep showing the previous version.
  const streamingText = stream && (stream.text || !hasVersions) ? stream.text : null;
  const text = streamingText ?? viewingVersion?.content ?? state.draft;
  const showCaret = streamingText !== null;
  const readOnly = !!stream || !!viewingVersion;

  const tokens = useMemo(() => tokenizeAnatomy(text), [text]);

  // Crossfade when switching versions or when a transform lands (§7 #9).
  const shownId = viewingVersion?.id ?? latest(state)?.id ?? null;
  const prevShown = useRef(shownId);
  const prevCount = useRef(state.versions.length);
  const newestSource = latest(state)?.source;
  const count = state.versions.length;
  useEffect(() => {
    const before = prevShown.current;
    const grew = count > prevCount.current;
    prevShown.current = shownId;
    prevCount.current = count;
    if (!before || !shownId || before === shownId) return;
    // A new generation or a manual edit is already on screen; only transforms and restores fade in.
    if (grew && (newestSource === "generated" || newestSource === "regenerated" || newestSource === "edited")) return;
    tintRef.current?.animate(
      reduced
        ? [{ opacity: 0.4 }, { opacity: 1 }]
        : [
            { opacity: 0.4, filter: "blur(2px)" },
            { opacity: 1, filter: "blur(0px)" },
          ],
      { duration: reduced ? 120 : 180, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
    );
  }, [shownId, reduced, newestSource, count]);

  useEffect(() => () => {
    if (idle.current) clearTimeout(idle.current);
  }, []);

  const scheduleCommit = () => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => actions.commitEdit(), IDLE_COMMIT_MS);
  };

  const tooLong = !readOnly && text.length > MAX_PROMPT_CHARS;

  return (
    <div>
      <div className="relative grid max-w-[68ch]">
        <div
          ref={washRef}
          aria-hidden
          className="pointer-events-none absolute -inset-x-3 inset-y-3 rounded-sm bg-accent-wash opacity-0"
        />
        <div
          ref={tintRef}
          aria-hidden
          className="editor-metrics type-body pointer-events-none col-start-1 row-start-1 min-h-[calc(28px*3+24px)] pt-6 text-fg"
        >
          {tokens.map((t, i) => (
            <span key={i} className={TINT_CLASS[t.kind]}>
              {t.text}
            </span>
          ))}
          {showCaret && (
            <span
              className="ml-px inline-block h-[1.1em] w-[0.55em] translate-y-[0.2em] rounded-[1px] bg-accent"
              aria-hidden
            />
          )}
          {text.endsWith("\n") ? "​" : null}
        </div>
        <label htmlFor="prompt-editor" className="sr-only">
          Prompt
        </label>
        <textarea
          id="prompt-editor"
          data-testid="prompt-editor"
          ref={editorRef}
          value={text}
          readOnly={readOnly}
          spellCheck={false}
          aria-busy={!!stream}
          onChange={(e) => {
            actions.dispatch({ type: "edit", text: e.target.value });
            scheduleCommit();
          }}
          onBlur={() => {
            if (idle.current) clearTimeout(idle.current);
            actions.commitEdit();
          }}
          className={cn(
            "editor-metrics type-body col-start-1 row-start-1 h-full w-full resize-none overflow-hidden bg-transparent pt-6 text-transparent",
            readOnly && "cursor-default",
          )}
        />
      </div>
      {tooLong && (
        <p className="mt-3 type-meta text-danger" role="alert">
          This prompt is over 20,000 characters. Shorten it to keep editing.
        </p>
      )}
    </div>
  );
}
