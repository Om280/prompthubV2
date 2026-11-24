# PromptHub — Product Requirements

Status: final product · Owner: lead engineer · Last updated: 2026-11-24
Revisions:
- v2 added the target-specific prompt strategies (§7a).
- v3 makes Gemini free tier the only AI provider (§7), adds Google sign-in for AI, and adopts Direction C
  "Interlock" as the production design (§8).

## 1. Problem

People know roughly what they want from an AI model but write vague prompts, get mediocre answers, and
rewrite by trial and error. Prompt advice is scattered and differs between ChatGPT, Claude and Gemini.

## 2. Product in one sentence

PromptHub turns a rough idea into a polished, editable prompt for the model you plan to use, asking only
the questions that change the result, and keeps every version so you can go back.

## 3. Audience

- **Primary:** people who use AI chat tools every day for work (writers, PMs, developers, students) and
  want better results without learning prompt engineering.
- **Secondary:** practitioners who already write prompts and want a fast drafting and refinement desk
  with history.

The product is local-first. Google sign-in is needed only for AI features; Basic Mode works signed out.
History lives in the browser, with no cloud sync.

## 4. Core journey

1. **Idea.** The user types a rough idea into the centered composer ("help me write a cold email to a
   landlord about a broken heater").
2. **Settings.** Before or after typing, they choose:
   - **Target platform:** ChatGPT, Claude or Gemini. This decides *how the prompt is written*, using a
     separate optimization profile per destination (§7a). It is **not** the model that generates it.
   - **Length:** Concise, Balanced (default) or Detailed.
   - **Tone** (optional): Neutral, Friendly, Professional, Direct or Playful.
3. **Clarify.** They press Generate (Ctrl/Cmd+Enter). The app asks **0–4 essential questions**, only ones
   whose answers would materially change the prompt. Each question has an optional suggested answer chip.
   The user can answer any subset, **Skip** an individual question, or **Skip all** and generate straight
   away. If the idea is already specific, the step is skipped automatically.
4. **Generate.** The prompt streams into the editor. The editor is the visual center of the page.
5. **Refine.** One-click actions apply to the current text and each creates a new version:
   - **Improve**: tighten clarity, add missing constraints, fix structure.
   - **Shorten**: same intent, fewer words.
   - **Expand**: add context, examples and output-format guidance.
   - **Regenerate**: a fresh draft from the original idea, answers and settings.
   - **Change tone**: pick Neutral, Friendly, Professional, Direct or Playful.
6. **Edit by hand.** The editor is fully editable. A manual edit becomes a version after 1.5 s idle or on
   blur, so a stream of keystrokes doesn't create dozens of versions.
7. **Copy.** A prominent Copy button (Ctrl/Cmd+Shift+C) copies the current text and confirms with
   "Copied".

## 5. History and versions

- Every prompt is saved automatically on first generation; there is no Save button.
- Each prompt has an ordered list of versions with the action that produced them (Generated, Improved,
  Shortened, Expanded, Regenerated, Tone: Friendly, Edited) and the engine that wrote it (provider and
  model, or Basic Mode).
- **Rename:** titles are generated from the idea (first ~6 meaningful words) and can be renamed inline.
- **Delete:** moves to *Recently deleted*. **Restore** brings it back; items older than 30 days are
  purged on app start. An Undo toast appears right after deleting.
- **Restore version:** opening an older version and choosing "Restore this version" makes a *new* version
  with that content. History is never rewritten.
- **Search** matches title, idea and current text. **Filters:** target platform, and Recently deleted.
- Persists in IndexedDB across reloads and browser restarts. No server storage.

## 6. Keyboard shortcuts

| Action | Windows/Linux | macOS |
| --- | --- | --- |
| Generate / continue | Ctrl+Enter | ⌘ Enter |
| Copy prompt | Ctrl+Shift+C | ⌘ ⇧ C |
| New prompt | Ctrl+N* | ⌘ N* |
| Toggle history | Ctrl+\ | ⌘ \ |
| Shortcut sheet | ? (outside text fields) | ? |

\*Browsers reserve Ctrl/Cmd+N in most contexts (it opens a new window, and a page cannot override it in
Chrome). The app registers it. Where the browser takes it first, Alt+N (⌥ N) is the documented fallback,
and the hint shown beside "New prompt" shows whichever works in the current browser. Hints appear next to
the buttons they trigger, matched to the platform.

## 7. AI generation and honesty

- **One provider: the Gemini API free tier.** All AI work (clarify, generate, improve, shorten, expand,
  tone, regenerate) runs server-side through the application owner's single `GEMINI_API_KEY` from Google
  AI Studio, in a project with no billing account. There is no OpenAI, Anthropic, OpenRouter, paid
  Gemini model, paid tool (such as Search grounding) or fallback provider. Users never see or enter a key.
- **Target platform ≠ generation provider.** Choosing Claude means Gemini writes a prompt using the Claude
  profile. The UI never says ChatGPT or Claude was called.
- **Model:** `GEMINI_MODEL` is configurable and must be on the verified free-tier allowlist
  (`src/lib/ai/gemini-models.ts`). There is no automatic switch to any other model.
- **Sign-in required for AI:** Google sign-in (Supabase Auth). Basic Mode stays public.
- **Shared quota:** every user draws on one project quota, so the server enforces persistent, atomic
  limits in Supabase (defaults, all configurable):
  - 5 new prompt workflows per user per day
  - 5 refinements per user per day
  - 3 requests per minute per user and 10 per IP
  - 1 concurrent request per user
  - 20,000 characters of input
  - app-wide RPM, TPM and RPD ceilings at 70% of the project's verified limits
  
  Retries with the same request id are never counted twice, and there is an `AI_ENABLED` emergency switch.
- **When the free quota runs out:** a clear "temporarily unavailable, resets at …" message appears. The
  draft is kept, Basic Mode stays available, and nothing retries in a loop or falls back to a paid model.
- **Basic Mode:** the local, deterministic template engine. It is labeled "Basic Mode, no AI" everywhere
  it appears. It uses fixed clarifying questions per detected task type and assembles the prompt from a
  platform-specific template. AI-only actions are shown as "Needs AI", with the reason. **AI output is
  never simulated**, and a Basic Mode prompt is never labeled as Gemini output.
- **Privacy disclosure:** on the free tier, Google may use submitted content to improve its products. This
  is said plainly on `/privacy` and in a first-use notice before the first AI request. The app never
  claims zero retention or confidential processing, and it sends Gemini only the idea, answers and prompt
  text (no name, email or ids).

## 7a. Target-specific prompt strategies

Research and sources: `docs/PROMPTING_RESEARCH.md`.

- Every target renders the **same structured brief** (task, goal, audience, context, requirements,
  constraints, definitions, output format, user examples, material, tone, length). No profile may drop or
  change a user requirement.
- **The profiles differ only where vendor documentation supports it:**
  - delimiter family: Markdown for ChatGPT and Gemini, XML tags for Claude
  - order of long material
  - whether the user's reasons are carried (Claude)
  - assumption policy and success criterion (ChatGPT)
  - date line, definitions and grounding line (Gemini)
  - how Detailed extends scope
- **Prompts are ordinary pasteable user messages** for the consumer chat apps. There are no
  system/developer wrappers, JSON message arrays or sampling parameters. An API-format export is a
  possible future feature (§10).
- **Never emitted by default:** "think step by step", ALL-CAPS emphasis, generic personas, blanket "be
  concise", invented examples, agentic persistence boilerplate.
- **Honest claims only.** The UI may say prompts are "structured for {platform}, following its published
  guidance". It may not claim better downstream answers unless that has been tested independently
  (`docs/PROMPTING_RESEARCH.md` §10).

## 8. Design direction

The approved production direction (2026-11-24) is **Direction C, "Interlock"**, specified in
`docs/design/DIRECTION-C.md`. In summary:
- **A prompt is a build.** The prompt is shown as connected, labelled blocks (role and task, context,
  requirements, constraints, output) that snap together as the prompt is written. A Plain text view is
  also available.
- **Four planes:** a cool Fog canvas, white Paper sheets, raised controls on inset tracks, and one
  Graphite plane for history and the command palette. Light by default, with a dark theme.
- **Type:** Funnel Display for the idea, titles and block labels; Schibsted Grotesk for text.
- **Colour:** cobalt for the one primary action and focus. Each platform has its own colour (Raspberry
  for ChatGPT, Lagoon for Claude, Ochre for Gemini), which tints the blocks. These are never the
  vendors' brand colours.
- **Moments:** the question stepper with progress, the piece-by-piece build while generating, and the
  copy "charge" down the block spine.
- **Navigation:** Ctrl/⌘ K command palette; graphite history panel (bottom sheet below 900 px); a
  floating action bar with a Refine sheet on mobile.

"Spruce and brass" (`docs/DESIGN.md`) and Directions A and B are retired. The explorations are archived
at the git tag `design-explorations-v1`.

**Interaction additions from the design pass:**
- Stop (Esc) while streaming
- Alt+S to skip a question
- Alt+[ and Alt+] to step through versions
- `/` to search history
- "Regenerate for {platform}" or "Regenerate as {length}" when settings change after a prompt exists

A stopped stream keeps its text as a version marked partial.

## 9. Non-functional requirements

- **Accessibility:** WCAG 2.2 AA contrast, full keyboard operation, visible focus, `aria-live` for
  streaming status and toasts, `prefers-reduced-motion` honored, labeled controls.
- **Responsive:** 360 px to 1920 px. Below 900 px the history rail becomes an overlay sheet.
- **Performance:** LCP < 2 s on a fast connection; first token typically < 2 s after the provider
  responds; no layout shift while streaming.
- **Security:**
  - Secrets (`GEMINI_API_KEY`, `SUPABASE_SECRET_KEY`) are server-only and never logged.
  - Every AI route verifies the user with `getClaims()` and never trusts a user id from the browser.
  - Zod validation on every route.
  - Input caps (idea ≤ 4,000 characters; ≤ 20,000 characters in total per AI request).
  - Persistent, atomic AI quotas, with a best-effort per-IP limit on the public Basic Mode routes.
- **Privacy:**
  - No analytics in v1.
  - Prompt history stays in the browser (IndexedDB), with no cloud sync.
  - The server stores AI usage metadata only (tokens, operation, model, status, duration), never prompt
    text.
  - Free-tier data use is disclosed (§7).

## 10. Out of scope for v1

Cloud history sync, sharing links, team libraries, running the prompt against a model and showing the
answer, user-supplied API keys, paid AI tiers, prompt marketplaces.

Candidate later features: **API export**, which would show the same prompt as an OpenAI
developer-message, Anthropic system-prompt or Gemini system-instruction payload, kept separate from the
consumer prompt.

## 11. Success criteria

- A first-time user goes from idea to copied prompt in under 60 s.
- 0 fake or placeholder controls: every visible button does what its label says.
- The critical journeys in ROADMAP §Phase 5 pass in Playwright on Chromium, at desktop and at mobile width.

## 12. Defaults chosen (no questions asked)

| Decision | Default |
| --- | --- |
| Default target | ChatGPT |
| Default length | Balanced |
| AI provider | Gemini API free tier only; `GEMINI_MODEL` from the allowlist (recommended `gemini-3.8-flash`, verified free and stable on 2026-11-24) |
| Max clarifying questions | 4 |
| Trash retention | 30 days |
| Theme | Follows the system preference; light (Design C's default) and dark themes are both available |
| Package manager | npm |
| Deployment | Vercel (Node runtime for API routes) |
