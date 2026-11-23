# PromptHub — Product Requirements

Status: Phase 1 · Owner: lead engineer · Last updated: 2026-11-23
Revisions: v2 adds target-specific prompt strategies (§7a) and replaces the design direction (§8, see
`docs/DESIGN.md`).

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

The product is single-user and local-first. There are no accounts in v1; history lives in the browser.

## 4. Core journey

1. **Idea.** The user types a rough idea into the centered composer ("help me write a cold email to a
   landlord about a broken heater").
2. **Settings.** Before or after typing, they choose:
   - **Target platform:** ChatGPT, Claude or Gemini. This decides *how the prompt is written*, using a
     separate optimization profile per destination (§7a). It is **not** the model that generates it.
   - **Length:** Concise, Balanced (default) or Detailed.
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

- Generation runs server-side through one provider layer for OpenAI, Anthropic and Google Gemini.
- Keys come only from server environment variables `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` and
  `GEMINI_API_KEY`. Nothing is exposed to the client, and no `NEXT_PUBLIC_` variable ever holds a key.
- The app detects which providers are configured. If the preferred one fails (rate limit, outage, invalid
  output) it falls back to the next configured provider *before any text has streamed*, and the UI says
  which engine wrote the result.
- **Basic Mode:** with no provider configured, the app still works through a local, deterministic
  template engine. It is labeled "Basic Mode, no AI" everywhere it appears. It uses fixed clarifying
  questions per detected task type and assembles the prompt from a platform-specific template. Improve,
  Expand, Shorten and Change tone are disabled in Basic Mode, with a tooltip that says what is needed to
  enable them. **AI output is never simulated.**
- Errors are specific and actionable: "Anthropic is rate-limited. Retried with OpenAI." /
  "No provider could complete this request. Try again in a minute."

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
  guidance". It may not claim better results until the comparative evaluation (ROADMAP 3.9) has data.

## 8. Design direction

The approved direction is **"Spruce and brass"**, specified in full in `docs/DESIGN.md`. In summary:
- A dark-first spruce workspace, with one centered column and no cards.
- One typeface, Mona Sans, whose width axis carries the hierarchy.
- A single brass accent, used for the primary action, the caret and focus.
- **The memorable element:** the idea is typed straight onto the page as a large headline, then becomes
  the prompt's title.
- Copy confirms in place, with a label swap and a brief wash over the copied text.
- On mobile, a bottom action bar holds Generate, then Refine, Tone and Copy.

The earlier blue-graphite manuscript concept was not approved and is retired.

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
- **Security:** keys server-only; input length caps (idea ≤ 4,000 chars, prompt ≤ 20,000); Zod
  validation on every route; best-effort per-IP rate limit on API routes.
- **Privacy:** no analytics in v1; prompts leave the device only for the selected AI request.

## 10. Out of scope for v1

Accounts and sync, sharing links, team libraries, running the prompt against a model and showing the
answer, user-supplied API keys in the browser, prompt marketplaces.

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
| Provider preference order | Anthropic → OpenAI → Gemini (configurable with `PROVIDER_ORDER`) |
| Max clarifying questions | 4 |
| Trash retention | 30 days |
| Theme | Dark default, light theme available; system preference respected on first visit |
| Package manager | npm |
| Deployment | Vercel (Node runtime for API routes) |
