"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAutosize } from "@/hooks/use-autosize";
import { TINT_CLASS, tokenizeAnatomy } from "./anatomy";
import { useWorkspace } from "./workspace-context";

const IDLE_COMMIT_MS = 1500;
export const MAX_PROMPT_CHARS = 20000;

/**
 * Edits go into the draft at once and become a version after 1.5 s of quiet or when the field
 * loses focus ("Saved as version n"). Shared by the block and plain views.
 */
export function useEditCommit() {
  const { actions } = useWorkspace();
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (idle.current) clearTimeout(idle.current);
    },
    [],
  );
  const change = useCallback(
    (text: string) => {
      actions.dispatch({ type: "edit", text });
      if (idle.current) clearTimeout(idle.current);
      idle.current = setTimeout(() => actions.commitEdit(), IDLE_COMMIT_MS);
    },
    [actions],
  );
  const blur = useCallback(() => {
    if (idle.current) clearTimeout(idle.current);
    actions.commitEdit();
  }, [actions]);
  return { change, blur };
}

/**
 * Plain text view (DIRECTION-C §6): one textarea of the full prompt over an identical-metrics tint
 * layer, so tags, headings and [placeholders] stay visible. What you copy is the textarea value.
 */
export function PlainEditor({ text, readOnly, streaming }: { text: string; readOnly: boolean; streaming: boolean }) {
  const { editorRef } = useWorkspace();
  const { change, blur } = useEditCommit();
  const tokens = useMemo(() => tokenizeAnatomy(text), [text]);
  useAutosize(editorRef, text);

  return (
    <div className="ih-plain">
      <div className="ih-wash" data-wash aria-hidden />
      <div className="ih-plain-tint" aria-hidden>
        {tokens.map((t, i) => (
          <span key={i} className={TINT_CLASS[t.kind] || undefined}>
            {t.text}
          </span>
        ))}
        {streaming && <span className="ih-caret" />}
        {text.endsWith("\n") ? "​" : null}
      </div>
      <label htmlFor="prompt-editor" className="ih-sr">
        Prompt
      </label>
      <textarea
        id="prompt-editor"
        data-testid="prompt-editor"
        ref={editorRef}
        className="ih-plain-text"
        value={text}
        readOnly={readOnly}
        spellCheck={false}
        aria-busy={streaming}
        onChange={(e) => change(e.target.value)}
        onBlur={blur}
      />
    </div>
  );
}
