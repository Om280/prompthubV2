"use client";

import { Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Info, Maximize2, Minimize2, PenLine, RotateCw, Square } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import type { Length, TargetPlatform } from "@/lib/contracts";
import { BASIC_REASON, LENGTH_DESCRIPTIONS, TARGET_LABELS, VERSION_NAMES, wordCount, type PreviewVersion } from "./data";
import s from "./cls";

/* ---------- Anatomy tint: colour only, metrics identical to the textarea ---------- */

const INLINE = /(<\/?[A-Za-z_][\w-]*>)|(\[[^\]\n]+\]|\{[^}\n]+\})|(\*\*|`)/g;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const cls = m[1] ? s.tTag : m[2] ? s.tSlot : s.tMark;
    out.push(
      <span key={`${key}-${i++}`} className={cls}>
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Tint({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, n) => {
        const key = `l${n}`;
        const nl = n < lines.length - 1 ? "\n" : "";
        const h = /^(#{1,3} )(.*)$/.exec(line);
        if (h)
          return (
            <span key={key}>
              <span className={s.tMark}>{h[1]}</span>
              <span className={s.tHead}>{inline(h[2], key)}</span>
              {nl}
            </span>
          );
        const li = /^(\s*)([-*]|\d+\.)( )(.*)$/.exec(line);
        if (li)
          return (
            <span key={key}>
              {li[1]}
              <span className={s.tMark}>{li[2]}</span>
              {li[3]}
              {inline(li[4], key)}
              {nl}
            </span>
          );
        return (
          <span key={key}>
            {inline(line, key)}
            {nl}
          </span>
        );
      })}
    </>
  );
}

/* ---------- Crop marks ---------- */

export function CropMarks() {
  return (
    <>
      <span aria-hidden className={`${s.crop} ${s.cropTL}`} />
      <span aria-hidden className={`${s.crop} ${s.cropTR}`} />
      <span aria-hidden className={`${s.crop} ${s.cropBL}`} />
      <span aria-hidden className={`${s.crop} ${s.cropBR}`} />
    </>
  );
}

/* ---------- Proof sheet ---------- */

export interface ProofProps {
  target: TargetPlatform;
  length: Length;
  text: string;
  mode: "generating" | "ready";
  /** Loop the press animation (the `generating` preview state) or play once. */
  loopPress: boolean;
  onPressDone: () => void;
  onStop: () => void;
  versions: PreviewVersion[];
  versionIndex: number;
  onVersion: (i: number) => void;
  onEdit: (text: string) => void;
  onRegenerate: () => void;
  copied: boolean;
  onCopy: () => void;
  edited: boolean;
}

export function Proof(p: ProofProps) {
  const reduce = useReducedMotion();
  const generating = p.mode === "generating";
  const v = p.versions[p.versionIndex];
  const latest = p.versionIndex === p.versions.length - 1;
  const words = wordCount(p.text);

  return (
    <section className={s.proofArea} aria-label="Your prompt">
      <div className={s.proofTop}>
        <div className={s.tab}>
          <span>For {TARGET_LABELS[p.target]}</span>
          <span className={s.tabLength} title={LENGTH_DESCRIPTIONS[p.length]}>
            {p.length === "concise" ? "Concise" : p.length === "balanced" ? "Balanced" : "Detailed"}
          </span>
        </div>
        {!generating && (
          <div className={s.versions}>
            <button
              type="button"
              className={s.stepBtn}
              aria-label="Previous version"
              disabled={p.versionIndex === 0}
              onClick={() => p.onVersion(p.versionIndex - 1)}
            >
              <ChevronLeft size={18} aria-hidden />
            </button>
            <span className={s.versionLabel} aria-live="polite">
              Version {p.versionIndex + 1} of {p.versions.length}
              <span className={`${s.versionName} ${s.hideMobile}`}>{VERSION_NAMES[v.source]}</span>
            </span>
            <button
              type="button"
              className={s.stepBtn}
              aria-label="Next version"
              disabled={latest}
              onClick={() => p.onVersion(p.versionIndex + 1)}
            >
              <ChevronRight size={18} aria-hidden />
            </button>
          </div>
        )}
      </div>

      <motion.div
        className={s.sheetWrap}
        data-copied={p.copied}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reduce ? 0.2 : 0.56, ease: [0.23, 1, 0.32, 1] }}
      >
        <CropMarks />
        <div className={s.sheet}>
          <div className={s.toolbar} data-generating={generating}>
            {generating ? (
              <>
                <span className={s.status} role="status" aria-live="polite">
                  <span className={s.statusInk} aria-hidden />
                  Writing with Basic Mode, no AI
                </span>
                <button type="button" className={`${s.btn} ${s.secondary}`} onClick={p.onStop}>
                  <Square size={14} aria-hidden />
                  Stop
                  <span className={s.kbd}>Esc</span>
                </button>
              </>
            ) : (
              <>
                <div className={s.toolGroup} role="group" aria-label="Refine">
                  <Unavailable icon={<PenLine size={15} aria-hidden />} label="Improve" />
                  <Unavailable icon={<Minimize2 size={15} aria-hidden />} label="Shorten" />
                  <Unavailable icon={<Maximize2 size={15} aria-hidden />} label="Expand" />
                  <button type="button" className={`${s.btn} ${s.secondary}`} onClick={p.onRegenerate}>
                    <RotateCw size={15} aria-hidden />
                    <span className={s.toolLabel}>Regenerate</span>
                  </button>
                  <Unavailable label="Tone" trailing={<ChevronDown size={15} aria-hidden />} />
                </div>
                <CopyButton copied={p.copied} onCopy={p.onCopy} />
              </>
            )}
          </div>
          {!generating && (
            <p className={s.basicNote} id="basic-reason">
              <Info size={15} aria-hidden />
              {BASIC_REASON}
            </p>
          )}

          <div className={s.proofBody}>
            {generating ? (
              <div
                className={s.press}
                style={
                  {
                    "--press-iter": p.loopPress ? "infinite" : "1",
                    "--press-dur": p.loopPress ? "3.4s" : "2.2s",
                  } as CSSProperties
                }
              >
                <pre
                  className={`${s.editor} ${s.pressText}`}
                  aria-hidden
                  onAnimationEnd={p.loopPress ? undefined : p.onPressDone}
                  style={{ display: "block" }}
                >
                  <span className={s.tint}>
                    <Tint text={p.text} />
                  </span>
                </pre>
                <div className={s.roller} aria-hidden />
              </div>
            ) : (
              <div className={s.editor}>
                <pre className={s.tint} aria-hidden>
                  <Tint text={p.text} />
                  {"\n"}
                </pre>
                <textarea
                  className={s.textarea}
                  value={p.text}
                  readOnly={!latest}
                  onChange={(e) => p.onEdit(e.target.value)}
                  aria-label="Prompt text"
                  aria-describedby="proof-foot"
                  spellCheck={false}
                />
              </div>
            )}
          </div>

          {!generating && (
            <p className={s.sheetFoot} id="proof-foot">
              <strong>Built with Basic Mode, no AI</strong>
              <span>{words} words</span>
              <span>{p.edited ? "Edited just now" : `${VERSION_NAMES[v.source]} ${latest ? "just now" : "earlier"}`}</span>
              {!latest && <span>Older version, read only</span>}
            </p>
          )}
        </div>
      </motion.div>
    </section>
  );
}

function Unavailable({ icon, label, trailing }: { icon?: ReactNode; label: string; trailing?: ReactNode }) {
  return (
    <button
      type="button"
      className={`${s.btn} ${s.unavailable}`}
      aria-disabled="true"
      aria-describedby="basic-reason"
      title="Needs an AI provider"
      onClick={(e) => e.preventDefault()}
    >
      {icon}
      {trailing ? label : <span className={s.toolLabel}>{label}</span>}
      {trailing}
    </button>
  );
}

export function CopyButton({ copied, onCopy, wide }: { copied: boolean; onCopy: () => void; wide?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <button
      type="button"
      className={`${s.btn} ${s.primary} ${s.copyBtn} ${wide ? s.grow : ""}`}
      onClick={onCopy}
      aria-label={copied ? "Copied" : "Copy prompt"}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={copied ? "done" : "copy"}
          className={s.copyFace}
          initial={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(2px)", y: 6 }}
          animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(2px)", y: -6 }}
          transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
        >
          {copied ? <Check size={18} strokeWidth={2.5} aria-hidden /> : <Copy size={17} aria-hidden />}
          {copied ? "Copied" : "Copy"}
          {!copied && <span className={s.kbd}>Ctrl ⇧ C</span>}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
