"use client";

import { Check, RotateCcw, Square } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";
import { TARGET_LABELS } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Segment } from "@/components/ui/segment";
import { useNow } from "@/hooks/use-history";
import { useReducedMotion } from "@/hooks/use-media";
import { formatCount, relativeLong, wordCount } from "@/lib/utils";
import { BlockEditor, type BuildProgress } from "./block-editor";
import { CopyButton } from "./copy-button";
import { MAX_PROMPT_CHARS, PlainEditor } from "./editor";
import { EngineIndicator } from "./engine-indicator";
import { engineName, provenance, TARGET_TIPS, versionLabel, writingLabel } from "./labels";
import { canRetry } from "./plate";
import { RefineBar } from "./toolbar";
import { VersionSwitcher } from "./version-switcher";
import { useWorkspace } from "./workspace-context";

const EASE = [0.23, 1, 0.32, 1] as const;

/**
 * The prompt sheet (DIRECTION-C §6, §9, §10): the largest white mass on screen. One component from
 * the first streamed piece to the finished, editable prompt, so nothing jumps between "generating"
 * and "result".
 */
export function PromptSheet() {
  const { state, actions, view, setView, mobile, preview, sheetRef, copy, writtenFor, enginePlacement } = useWorkspace();
  const reduced = useReducedMotion();
  const stream = state.stream;
  const hasVersions = state.versions.length > 0;
  const viewingVersion = state.viewing !== null ? state.versions[state.viewing] : undefined;

  // While a stream hasn't produced text yet, keep showing the previous version.
  const streamingText = stream && (stream.text || !hasVersions) ? stream.text : null;
  const text = streamingText ?? viewingVersion?.content ?? state.draft;
  const streaming = streamingText !== null;
  const readOnly = !!stream || !!viewingVersion;

  // A new build starts with each generate or regenerate stream (state adjusted during render, so the
  // block view sees the new id on the same render the stream starts).
  const generatingNow = !!stream && (stream.activity === "generate" || stream.activity === "regenerate");
  const [build, setBuild] = useState({ id: 0, active: generatingNow });
  let buildId = build.id;
  if (build.active !== generatingNow) {
    buildId = build.id + (generatingNow ? 1 : 0);
    setBuild({ id: buildId, active: generatingNow });
  }

  const [progress, setProgress] = useState<BuildProgress>({ placed: 0, total: 0, done: true });
  const onProgress = useCallback(
    (p: BuildProgress) =>
      setProgress((prev) => (prev.placed === p.placed && prev.total === p.total && prev.done === p.done ? prev : p)),
    [],
  );
  const building = !!stream || (view === "blocks" && !progress.done);
  // Basic Mode hands over the whole text at once; the build that follows is still presenting it.
  const lastEngine = state.versions[state.versions.length - 1]?.engine;
  const status = stream
    ? writingLabel(state, preview)
    : building && lastEngine && lastEngine.kind !== "manual"
      ? `Writing with ${engineName(lastEngine, preview)}`
      : "Placing the blocks";

  const tooLong = !readOnly && text.length > MAX_PROMPT_CHARS;
  const error = state.phase === "error" && state.error && hasVersions ? state.error : null;

  return (
    <section
      ref={sheetRef}
      className="ih-sheet"
      data-platform={writtenFor}
      data-copied={copy.copied}
      aria-label="Your prompt"
    >
      <div className="ih-sheet-head">
        <div className="ih-sheet-head-left">
          <AnimatePresence mode="popLayout" initial={false}>
            {copy.copied ? (
              <motion.div
                key="copied"
                className="ih-copied"
                initial={reduced || !copy.animate ? { opacity: 0 } : { opacity: 0, y: 6, filter: "blur(2px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={{ duration: 0.22, ease: EASE }}
              >
                <span className="ih-copy-check" aria-hidden>
                  <Check size={14} strokeWidth={3} />
                </span>
                <span>
                  Copied {formatCount(copy.words)} {copy.words === 1 ? "word" : "words"} for {TARGET_LABELS[writtenFor]}.
                  {!mobile && <span className="ih-copied-rest"> Paste it into a new chat.</span>}
                </span>
              </motion.div>
            ) : building ? (
              <motion.div
                key="status"
                className="ih-status"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
              >
                <span className="ih-pulse" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                <span>{status}</span>
                {view === "blocks" && progress.total > 0 && !progress.done && (
                  <span className="ih-status-count" aria-hidden>
                    {progress.placed} of {progress.total} blocks
                  </span>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="versions"
                className="ih-sheet-head-left"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
              >
                {mobile ? (
                  <>
                    {enginePlacement === "sheet" && <EngineIndicator placement="inline" compact />}
                    {hasVersions && (
                      <span className="ih-vname">{versionLabel(state.versions[state.viewing ?? state.versions.length - 1])}</span>
                    )}
                  </>
                ) : (
                  <VersionSwitcher />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="ih-sheet-head-right">
          <Segment
            options={["blocks", "plain"] as const}
            value={view}
            onChange={setView}
            labels={{ blocks: "Blocks", plain: mobile ? "Text" : "Plain text" }}
            names={mobile ? { plain: "Plain text" } : undefined}
            label="Editor view"
          />
          {!mobile &&
            (stream ? (
              <Button variant="secondary" onClick={() => actions.stop()}>
                <Square size={13} aria-hidden />
                Stop
                <Kbd keys={["Esc"]} />
              </Button>
            ) : (
              <CopyButton showHint={false} />
            ))}
        </div>
      </div>

      <div className="ih-sheet-body">
        {error && (
          <div className="ih-strip" data-tone="danger" role="alert">
            <span>{error.message}</span>
            {canRetry(error.code) && (
              <Button variant="secondary" size="sm" onClick={actions.retry}>
                <RotateCcw size={14} aria-hidden />
                Try again
              </Button>
            )}
          </div>
        )}
        {viewingVersion && state.viewing !== null && (
          <div className="ih-strip">
            <span>
              Viewing version {state.viewing + 1}, {versionLabel(viewingVersion).toLowerCase()}.
            </span>
            <Button variant="secondary" size="sm" onClick={actions.restore}>
              <RotateCcw size={14} aria-hidden />
              Restore this version
            </Button>
            <Button size="sm" onClick={() => actions.dispatch({ type: "viewVersion", index: null })}>
              Back to latest
            </Button>
          </div>
        )}
        {view === "blocks" ? (
          <BlockEditor text={text} readOnly={readOnly} streaming={streaming} buildId={buildId} onProgress={onProgress} />
        ) : (
          <PlainEditor text={text} readOnly={readOnly} streaming={streaming} />
        )}
        {tooLong && (
          <p className="ih-hint ih-danger-text mt-3" role="alert">
            This prompt is over 20,000 characters. Shorten it to keep editing.
          </p>
        )}
      </div>

      {!mobile && hasVersions && (
        <div inert={building || undefined}>
          <RefineBar />
        </div>
      )}
      {hasVersions && !stream && <Provenance text={text} />}
    </section>
  );
}

/** "Built with Basic Mode, no AI   Saved as version 3   170 words   Uses Markdown sections…". */
function Provenance({ text }: { text: string }) {
  const { state, preview, writtenFor } = useWorkspace();
  const now = useNow();
  const shown = state.viewing !== null ? state.versions.slice(0, state.viewing + 1) : state.versions;
  const author = [...shown].reverse().find((v) => v.engine.kind !== "manual");
  const lastEdit = [...shown].reverse().find((v) => v.source === "edited");
  const words = wordCount(text);
  const saved = state.notice?.kind === "saved" ? state.notice.version : null;
  return (
    <p className="ih-provenance">
      {author && <b>{provenance(author.engine as Exclude<typeof author.engine, { kind: "manual" }>, preview)}</b>}
      {saved !== null ? (
        <span role="status">Saved as version {saved}</span>
      ) : (
        lastEdit && now > 0 && <span>Edited {relativeLong(lastEdit.createdAt, now)}</span>
      )}
      <span>{words === 1 ? "1 word" : `${formatCount(words)} words`}</span>
      <span>{TARGET_TIPS[writtenFor]}</span>
    </p>
  );
}
