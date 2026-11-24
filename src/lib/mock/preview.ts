/**
 * Dev-only preview states for screenshots and visual review. Ignored when NODE_ENV is "production".
 *
 *   /?preview=<state>[&history=open][&theme=light][&slow=1][&storage=off]
 *
 *   preview=empty          first impression, empty composer
 *   preview=clarifying     "Finding what matters" with skeleton lines (add &slow=1 for the 8 s note)
 *   preview=questions      three follow-up questions: one answered by chip, one skipped
 *   preview=streaming      generation frozen mid-stream (caret block, Stop button, disabled actions)
 *   preview=ready          a saved prompt with three versions, toolbar and provenance line
 *   preview=old-version    viewing version 2 of 3 (read-only, "Restore this version")
 *   preview=error          inline error under the toolbar, previous text kept
 *   preview=basic          Basic Mode presentation: AI actions disabled with the reason
 *   preview=history-empty  no saved prompts; the rail opens on its empty state
 *
 *   history=open           opens the history rail (docked at >=900px, bottom sheet below)
 *   theme=light            forces the light theme (theme=dark forces dark)
 *   slow=1                 with preview=clarifying, shows "Still working. Taking longer than usual."
 *   storage=off            history behaves as if IndexedDB were unavailable (shows the notice)
 *
 * Only `preview=<state>` switches to the mock client and seeded history ("Preview data" in the
 * header). `history`, `theme` and `storage` on their own apply to the real app and real API.
 *
 * Every state is built by running real session actions through `sessionReducer`, so a preview
 * can never show a combination the app itself could not reach. All text is sample data.
 */
import { initialSession, sessionReducer, type SessionAction, type SessionState } from "@/hooks/use-session";
import type { PromptRecord, VersionRecord } from "@/lib/contracts";
import { PROVIDER_UNAVAILABLE_ERROR, renderMock } from "./adapter";
import { briefByKey } from "./briefs";

export const PREVIEW_STATES = [
  "empty",
  "clarifying",
  "questions",
  "streaming",
  "ready",
  "old-version",
  "error",
  "basic",
  "history-empty",
] as const;

export type PreviewState = (typeof PREVIEW_STATES)[number];

export interface PreviewConfig {
  state: PreviewState | null;
  historyOpen: boolean;
  theme: "light" | "dark" | null;
  slow: boolean;
  storageOff: boolean;
}

export function readPreview(search: string): PreviewConfig | null {
  if (process.env.NODE_ENV === "production") return null;
  const p = new URLSearchParams(search);
  const raw = p.get("preview");
  const state = (PREVIEW_STATES as readonly string[]).includes(raw ?? "") ? (raw as PreviewState) : null;
  const theme = p.get("theme");
  const cfg: PreviewConfig = {
    state,
    historyOpen: p.get("history") === "open" || state === "history-empty",
    theme: theme === "light" || theme === "dark" ? theme : null,
    slow: p.get("slow") === "1",
    storageOff: p.get("storage") === "off",
  };
  if (!cfg.state && !cfg.historyOpen && !cfg.theme && !cfg.storageOff) return null;
  return cfg;
}

const AI = { kind: "ai", provider: "gemini", tier: "free", model: "gemini-3.5-flash-lite" } as const;

function run(start: SessionState, actions: SessionAction[]): SessionState {
  return actions.reduce(sessionReducer, start);
}

function questionsState(): SessionState {
  const mb = briefByKey("landlord");
  return run(initialSession("chatgpt", "balanced"), [
    { type: "setIdea", idea: mb.idea },
    { type: "clarifyStart" },
    { type: "questionsReceived", questions: mb.questions },
    { type: "answer", id: "q1", text: mb.questions[0].suggestions[0] },
    { type: "skip", id: "q3" },
  ]);
}

/**
 * Builds the session for a preview state. `seed` is the history seed so "ready" opens a real
 * saved prompt (and its rail row shows as active).
 */
export function buildPreviewSession(
  cfg: PreviewConfig,
  seed: { prompts: PromptRecord[]; versions: VersionRecord[] },
): SessionState | null {
  const ready = () => {
    const prompt = seed.prompts.find((p) => p.id === "seed-landlord")!;
    const versions = seed.versions.filter((v) => v.promptId === prompt.id);
    return sessionReducer(initialSession(), { type: "load", prompt, versions });
  };

  switch (cfg.state) {
    case null:
    case "empty":
    case "history-empty":
      return null;
    case "clarifying": {
      const s = run(initialSession(), [
        { type: "setIdea", idea: briefByKey("landlord").idea },
        { type: "clarifyStart" },
      ]);
      return cfg.slow ? sessionReducer(s, { type: "clarifySlow" }) : s;
    }
    case "questions":
      return questionsState();
    case "streaming": {
      const s = questionsState();
      const answers = [{ questionId: "q1", question: s.questions[0].question, answer: s.questions[0].answer }];
      const { text } = renderMock(s.idea, { target: s.target, length: s.length, answers });
      return run(s, [
        { type: "streamStart", activity: "generate", answers },
        { type: "streamMeta", engine: AI },
        { type: "streamDelta", text: text.slice(0, Math.floor(text.length * 0.42)) },
      ]);
    }
    case "ready":
      return ready();
    case "old-version":
      return sessionReducer(ready(), { type: "viewVersion", index: 1 });
    case "error":
      return run(ready(), [
        { type: "streamStart", activity: "improve" },
        { type: "streamMeta", engine: AI },
        { type: "streamError", message: PROVIDER_UNAVAILABLE_ERROR.message },
      ]);
    case "basic": {
      const mb = briefByKey("landlord");
      const { text, title } = renderMock(mb.idea, { target: "chatgpt", length: "balanced" });
      const now = Date.now();
      return run(initialSession(), [
        { type: "setIdea", idea: mb.idea },
        { type: "streamStart", activity: "generate", answers: [] },
        { type: "streamMeta", engine: { kind: "basic" } },
        { type: "streamDone", text, title, id: "preview-basic-v1", promptId: "preview-basic", now: now - 3 * 60_000 },
      ]);
    }
  }
}
