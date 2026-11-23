# PromptHub: Design direction "Spruce and brass"

Status: proposal, replaces ARCHITECTURE §8 (the blue-graphite and Newsreader direction was not approved).
Scope: visual system, layout, component specs, motion, microcopy. No code.

## 1. Concept

PromptHub is a quiet, deep-spruce workspace for drafting what you will hand to a machine. A single
grotesk (Mona Sans) carries everything, and its **width axis** creates the hierarchy instead of a
second typeface. One brass accent marks the primary action, the caret and focus.

**The one memorable thing: the idea is the headline.** On first load there is no input box. You type
straight onto the page in large, slightly expanded display type, as if you were writing the title of a
document. After you press Generate, the same line drops to a compact title above the prompt it
produced, and you can still edit it there. Everything else stays disciplined: hairlines, plain text
lists, no cards, no gradients, no glow.

A second, quieter detail does a job rather than decorate: **prompt anatomy tint**. Inside the plain
text editor, XML-like tags, Markdown markers and headings get a faint color so you can see the
prompt's structure without it turning into a code editor (§6.5).

## 2. Color tokens

Ground hue is a desaturated spruce (green-grey, about 155°). It is not neutral black and not
blue-graphite. The accent is brass, a muted gold, not acid green, vermilion or terracotta. Contrast
ratios are WCAG 2.x relative luminance, computed against `--color-bg` and `--color-surface`.

### Dark (default)

| Token | Hex | Role | on bg | on surface |
| --- | --- | --- | --- | --- |
| `--color-bg` | `#121816` | page ground | n/a | n/a |
| `--color-surface` | `#182120` | rail, popovers, sheets, toasts | n/a | n/a |
| `--color-surface-2` | `#202A28` | hover row, selected segment track, chip fill | n/a | n/a |
| `--color-border` | `#2A3431` | hairlines, dividers (decorative only) | 1.40 | 1.28 |
| `--color-border-control` | `#5E6B66` | input underline, chip outline, kbd outline (≥3:1 non-text) | 3.23 | n/a |
| `--color-fg-strong` | `#F7FAF8` | idea headline, editor headings | 17.11 | 15.65 |
| `--color-fg` | `#E8EEEA` | body text, editor body, primary labels | 15.28 | 13.97 |
| `--color-fg-muted` | `#A6B2AC` | secondary labels, inactive segments, placeholders | 8.21 | 7.50 |
| `--color-fg-subtle` | `#87938D` | meta, timestamps, group labels, kbd glyphs, Markdown markers | 5.64 | 5.16 (4.63 on surface-2) |
| `--color-accent` | `#E9BC6A` | primary button fill, caret, active segment bar, links | 10.16 | 9.29 |
| `--color-accent-hover` | `#F2CB85` | primary hover | n/a | n/a |
| `--color-accent-on` | `#1B1406` | text/icons on accent (10.32 on accent) | n/a | n/a |
| `--color-accent-wash` | `#E9BC6A1F` | copy flash, selection background (12% alpha) | n/a | n/a |
| `--color-tag` | `#93C4D8` | XML-like tags in the editor (anatomy tint) | 9.53 | 8.71 |
| `--color-success` | `#86D3A4` | "Copied" check, restored notice icon | 10.16 | 9.29 |
| `--color-danger` | `#F29384` | errors, delete confirm text | 7.95 | 7.27 |
| `--color-focus` | `#E9BC6A` | 2px focus ring, 2px offset in `--color-bg` | 10.16 | 9.29 |
| `--color-scrim` | `#0A0E0Dcc` | behind mobile sheets and the shortcut sheet | n/a | n/a |

### Light

Cool off-white with the same green cast. It is not cream (#F4F1EA is a known default).

| Token | Hex | Role | on bg | on surface |
| --- | --- | --- | --- | --- |
| `--color-bg` | `#F2F4F1` | ground | n/a | n/a |
| `--color-surface` | `#FFFFFF` | rail, popovers, sheets, toasts | n/a | n/a |
| `--color-surface-2` | `#E6EBE8` | hover, segment track, chip fill | n/a | n/a |
| `--color-border` | `#D6DDD9` | hairlines | 1.25 | 1.38 |
| `--color-border-control` | `#7A8681` | input underline, chip and kbd outline | 3.42 | n/a |
| `--color-fg-strong` | `#0E1613` | headline, headings | 16.61 | 18.38 |
| `--color-fg` | `#17211D` | body | 14.93 | 16.51 |
| `--color-fg-muted` | `#4C5A54` | secondary | 6.55 | 7.25 |
| `--color-fg-subtle` | `#5F6C66` | meta | 4.97 | 5.49 (4.55 on surface-2) |
| `--color-accent` | `#8A5C0C` | primary fill, caret, active bar, links | 5.25 | 5.81 |
| `--color-accent-hover` | `#764E08` | primary hover | n/a | n/a |
| `--color-accent-on` | `#FFFFFF` | on accent (5.81) | n/a | n/a |
| `--color-accent-wash` | `#8A5C0C1A` | copy flash, selection | n/a | n/a |
| `--color-tag` | `#1F6680` | editor tags | 5.81 | 6.42 |
| `--color-success` | `#1E7A47` | success | 4.83 | 5.34 |
| `--color-danger` | `#B4372B` | danger | 5.39 | 5.96 |
| `--color-focus` | `#8A5C0C` | focus ring | 5.25 | 5.81 |
| `--color-scrim` | `#17211D66` | scrim | n/a | n/a |

Rules: accent fills exactly one button per view (Generate or Copy, never both visible as filled).
Danger is text color only, never a red fill. Success appears only next to a check icon. Text never
uses `--color-border*`. Theme switches by `data-theme` on `<html>`, with no transition on colors
(an instant swap, see §7).

## 3. Type

One family, **Mona Sans** (Google Fonts, variable, `wght` 200 to 900, `wdth` 75 to 125):
`Mona_Sans({ subsets: ['latin'], axes: ['wdth'], display: 'swap', variable: '--font-sans' })`.
Confirm the export name in `next/font/google` at build time. Fallback stack:
`ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif`.

The width axis is the typographic device: **expanded (wdth 112) for the user's idea, normal (100) for
text you read, semi-condensed (92) for dense UI chrome.** No serif and no mono. The kbd hint uses
tabular figures and the condensed width, which looks like a key without being code.

| Role | Size / line-height | Tracking | Weight | wdth | Notes |
| --- | --- | --- | --- | --- | --- |
| Display (empty composer, first impression) | 40 / 48 px | -0.02em | 440 | 112 | steps down to 32/40 after 90 chars and 26/34 after 180 chars. Mobile: 30/38, then 26/34, then 22/30 |
| Idea title (composer after generate) | 22 / 30 px | -0.01em | 520 | 112 | mobile 19/26 |
| Question text | 17 / 26 px | -0.005em | 500 | 100 | |
| Answer input | 16 / 24 px | 0 | 400 | 100 | 16px minimum on mobile so iOS does not zoom |
| Editor body | 16.5 / 28 px (1.7) | 0 | 400 | 100 | 68ch max; mobile 16 / 27 |
| Editor heading line | same metrics as body | 0 | 400 | 100 | color only (`--color-fg-strong`); weight cannot change because the tint overlay must match textarea metrics |
| UI label (buttons, segments, rows) | 14 / 20 px | 0 | 520 | 96 | |
| Small / meta (times, group labels, counts, hints) | 12.5 / 18 px | 0.005em | 450 | 96 | sentence case, never all caps |
| Kbd | 11.5 / 16 px | 0.02em | 560 | 92 | `font-variant-numeric: tabular-nums` |
| Wordmark "PromptHub" | 15 / 20 px | -0.01em | 640 | 118 | the only place above 112 |

Scale ratio is about 1.25 from 12.5 (12.5, 14, 16.5, 22 (title), 26, 32, 40). Numbers in history use
`tabular-nums`. Text selection uses `--color-accent-wash`.

## 4. Space, radii, borders, elevation, widths

**Spacing (4px base):** `--space-1` 4, `-2` 8, `-3` 12, `-4` 16, `-5` 24, `-6` 32, `-7` 48, `-8` 64,
`-9` 96. Grouping comes from space, not boxes: 8 inside a control group, 24 between groups, 48 between
the composer, questions and editor sections.

**Radii follow size, smallest to largest. One radius everywhere is not allowed:**

| Token | px | Used for |
| --- | --- | --- |
| `--radius-xs` | 3 | kbd, segment indicator ends |
| `--radius-sm` | 6 | buttons, chips, inputs with fills, rail rows |
| `--radius-md` | 10 | popovers, menus, tooltips, toasts |
| `--radius-lg` | 16 | top corners of mobile sheets, shortcut sheet |

The composer, questions and editor have **no container at all**: no box, no radius. Pills (999px) are
used only for the 6px engine status dot.

**Borders:** 1px hairline `--color-border` for structure that exists (header bottom when the page has
scrolled, rail edge, toolbar top edge on mobile). Inputs use a 1px `--color-border-control` underline
that becomes a 2px `--color-accent` underline on focus. Chips get a 1px control outline.

**Elevation:** flat by default. Only floating layers get a shadow, and only one:
`--shadow-float: 0 1px 0 0 #ffffff0a inset, 0 12px 32px -8px #00000080` (dark) /
`0 12px 32px -12px #17211d33` (light). It is used for popovers, toasts, sheets and the sticky toolbar
once it is stuck. Nothing gets a resting shadow.

**Widths:** content column `--w-column: 720px` (editor text capped at 68ch, about 640px); rail
`--w-rail: 280px`; popovers 240 to 320px; shortcut sheet 520px; toasts 360px. Header height 56px.
Side gutters are 24px desktop and 16px mobile.

**Breakpoints:** `sm` 640, `md` 900, `lg` 1180. At 900 and above, the rail docks and pushes the column
(the column re-centers in the remaining space). Below 900, the rail becomes a bottom sheet. Below 640,
the toolbar becomes a bottom action bar.

## 5. Layout

Alignment: the column is centered on the page and **its content is left-aligned**. Nothing is
centered-text except empty-state lines in the rail. The empty composer sits with its first line at
about 30% of viewport height, so the page feels like a title page rather than a form.

### Desktop 1440

(a) Empty first impression

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ [≡] PromptHub                                   ● Claude Sonnet   New prompt Ctrl N   ?  ◐│ 56
│                                                                                          │
│                 For  ChatGPT   Claude   Gemini                      Balanced ▾           │
│                      ‾‾‾‾‾‾‾                                                             │
│                 Describe what you want                                                   │
│                 the AI to do                      (40px expanded, caret in brass)        │
│                 ──────────────────────────────────────────────────────────── hairline    │
│                 Rough is fine. You can refine it after.    [ Generate prompt  Ctrl ↵ ]   │
│                                                                                          │
│                 Try one                                                                  │
│                 Write a cold email to my landlord about a broken heater                  │
│                 Explain a SQL query to a new analyst                                     │
│                 Plan a 3-day trip to Lisbon on a budget                                  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
       column 720px centered, left-aligned contents
```

(b) Questions shown

```
│ [≡] PromptHub                                   ● Claude Sonnet   New prompt Ctrl N   ?  ◐│
│                 For  ChatGPT   Claude   Gemini                      Balanced ▾           │
│                 Write a cold email to my landlord about a broken      (22px title)       │
│                 heater                                                                   │
│                                                                                          │
│                 3 questions to sharpen the prompt                         Skip all       │
│                                                                                          │
│                 What outcome do you want from the landlord?                    Skip      │
│                 ____________________________________________________________            │
│                 [Repair within 48 hours] [Rent reduction] [Written reply]               │
│                                                                                          │
│                 How firm should it sound?                                      Skip      │
│                 ____________________________________________________________            │
│                 [Polite but firm] [Friendly] [Formal, cites rights]                     │
│                                                                                          │
│                 Anything they already know?                          Skipped  Undo       │
│                                                                                          │
│                 [ Generate prompt  Ctrl ↵ ]   1 answered, 1 skipped                      │
```

(c) Streaming

```
│                 For  ChatGPT   Claude   Gemini                      Balanced ▾           │
│                 Write a cold email to my landlord about a broken heater                  │
│                 2 answers  Show                                                          │
│ ─ sticky toolbar ───────────────────────────────────────────────────────────────────────│
│                 Writing with Claude Sonnet               [ Stop  Esc ]                   │
│                                                                                          │
│                 # Role                                                                   │
│                 You are a tenant writing to a landlord. Keep it                          │
│                 courteous and specific.▌   (brass block caret, static)                   │
```

(d) Ready with toolbar (toolbar sticks under the header once scrolled; gets `--shadow-float` when stuck)

```
│                 Write a cold email to my landlord about a broken heater      ChatGPT, Balanced│
│                 2 answers  Show                                                          │
│ ───────────────────────────────────────────────────────────────────────────────────────│
│                 ‹ Version 3 of 3 ›  Improved      Improve Shorten Expand Regenerate  Tone ▾ │ [ Copy  Ctrl ⇧ C ] │
│ ───────────────────────────────────────────────────────────────────────────────────────│
│                 # Role                                                                   │
│                 You are a tenant writing to your landlord...                             │
│                 ## Task                                                                  │
│                 - Ask for the heater to be repaired within 48 hours                      │
│                 ...                                                                      │
│                 Written by Claude Sonnet   Edited 2 min ago   312 words                  │
```

(e) History open (rail docks at left and pushes; column re-centers in the remaining 1160px)

```
┌──────────────────────────┬───────────────────────────────────────────────────────────────┐
│ [≡] PromptHub            │                    ● Claude Sonnet  New prompt Ctrl N   ?  ◐  │
│ ⌕ Search prompts         │                                                               │
│ All  ChatGPT  Claude  Gem│        Write a cold email to my landlord about a broken heater│
│                          │        ‹ Version 3 of 3 ›  Improved   Improve Shorten ...  Copy │
│ Today                    │                                                               │
│▌Cold email to landlord 2m│        # Role                                                 │
│  SQL query for analyst 1h│        ...                                                    │
│ Yesterday                │                                                               │
│  Lisbon trip on a budg  …│                                                               │
│ Previous 7 days          │                                                               │
│  ...                     │                                                               │
│                          │                                                               │
│ Recently deleted  2      │                                                               │
│ Hide history  Ctrl \     │                                                               │
└──────────────────────────┴───────────────────────────────────────────────────────────────┘
```

### Mobile 390

```
 empty                        questions                     ready                         history (sheet)
┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
│[≡] PromptHub  ●  ⊕  ?│    │[≡] PromptHub  ●  ⊕  ?│    │[≡] PromptHub  ●  ⊕  ?│    │ (page dimmed)        │
│                      │    │Write a cold email to │    │Write a cold email to │    ├──────────────────────┤
│For ChatGPT Claude Gem│    │my landlord about a…  │    │my landlord about a…  │    │        ───           │
│    ‾‾‾‾‾‾  Balanced ▾│    │                      │    │ChatGPT, Balanced     │    │ History        Done  │
│                      │    │3 questions  Skip all │    │‹ v3 of 3 ›  Improved │    │ ⌕ Search prompts     │
│Describe what you     │    │                      │    │                      │    │ All ChatGPT Claude Ge│
│want the AI to do     │    │What outcome do you   │    │# Role                │    │ Today                │
│(30px)                │    │want?           Skip  │    │You are a tenant      │    │ Cold email to la  2m │
│──────────────────────│    │_____________________ │    │writing to your…      │    │ SQL query for an  1h │
│Rough is fine.        │    │[Repair in 48h]       │    │                      │    │ Yesterday            │
│                      │    │[Rent reduction]      │    │                      │    │ ...                  │
│Try one               │    │                      │    │                      │    │                      │
│Write a cold email…   │    │How firm?       Skip  │    │                      │    │ Recently deleted  2  │
│Explain a SQL query…  │    │_____________________ │    ├──────────────────────┤    │                      │
├──────────────────────┤    ├──────────────────────┤    │[Refine▾][Tone▾][ Copy ]│    └──────────────────────┘
│[   Generate prompt  ]│    │[   Generate prompt  ]│    │ safe-area inset      │      92dvh, drag to close
│ safe-area inset      │    │ safe-area inset      │    └──────────────────────┘
└──────────────────────┘    └──────────────────────┘
```

Mobile rules: the primary action always lives in a bottom bar (`position: fixed`, padding-bottom
`max(12px, env(safe-area-inset-bottom))`, top hairline, `--color-bg` at 92% with 12px backdrop blur).
The bar holds Generate before a prompt exists and Refine / Tone / Copy after. The bar rises with the
keyboard using `interactive-widget=resizes-content` in the viewport meta. Use `100dvh`, never `100vh`.
Header on mobile: history button, wordmark, engine dot only (the label opens in a popover on tap), New
prompt as a `+` icon button with an accessible label, and `?` is hidden (there is no keyboard). Platform
tabs and length stay on one row. At 360px, Gemini is not truncated: the row scrolls horizontally with
a 16px fade mask.

Toolbar location: desktop and tablet have a sticky row above the editor (top: 56px). Below 640px it
moves to the bottom action bar. The version switcher stays above the editor at every width.

## 6. Components

### 6.1 Composer

- An auto-height `<textarea>` with no border, no background, and no radius. Display type (§3). The
  caret color is `--color-accent`. Placeholder: `--color-fg-muted`. A hairline sits 16px below the
  text, and its color becomes `--color-border-control` on focus. No glow.
- The composer has focus on load (desktop only; on mobile, do not auto-focus, because the keyboard
  would cover the first impression).
- Character cap 4,000. A counter appears at the right of the helper line only past 3,500: "3,612 /
  4,000", which turns danger at the cap.
- Below the line: the helper "Rough is fine. You can refine it after." on the left, and the Generate
  button on the right. Generate is disabled until there is at least 1 non-space character. Ctrl/Cmd+Enter
  works from inside the field.
- After generation it becomes the idea title (22px). It is still a textarea; editing it shows an inline
  "Regenerate from this idea" text button under it.
- "Try one" examples: three plain text buttons in `--color-fg-muted`, 15px, with a hover color of
  `--color-fg`. Clicking one fills the composer and moves focus to its end. They are hidden once the
  composer has text.

### 6.2 Target platform and length

- **Platform: an underline segmented control** (Radix `ToggleGroup`, single, `role="radiogroup"`
  semantics). It is preceded by the word "For" in `--color-fg-subtle`. Options are text only (no brand
  logos): ChatGPT, Claude, Gemini, 14px wdth 96, 16px apart. Inactive: `--color-fg-muted`. Hover:
  `--color-fg`. Active: `--color-fg-strong` with a 2px brass bar 6px below the baseline, as wide as the
  label. The bar slides between options (§7). Arrow keys move the selection, as in a radiogroup.
- A tooltip on each option (600ms delay, instant after the first) explains the effect: "Uses XML tags
  and clear sections, the way Claude reads best." / "Uses Markdown sections and a role line." / "Puts
  the task first, with short direct sections."
- **Length: an inline menu** on the right of the same row: the label "Balanced" plus a chevron. It
  opens a Radix `DropdownMenu` (radius md, surface, shadow-float, origin at the trigger) with three
  rows, each with a one-line description in meta size: Concise "Short, essentials only", Balanced
  "Enough context for good results", Detailed "Full context, examples and format rules". A check marks
  the current option.
- Changing either value after a prompt exists does not regenerate silently. A text button appears
  next to the row: "Regenerate for Claude" / "Regenerate as Detailed".

### 6.3 Engine indicator

Header, right side: a 6px dot plus a label in meta size `--color-fg-muted`. Its states:
- AI: success-colored dot, "Claude Sonnet" (provider and model short name). The popover on click says:
  "Prompts are written by Anthropic Claude Sonnet 5.5. Falls back to OpenAI, then Gemini." It lists
  the configured providers with a check.
- Fallback happened: the dot stays, the label reads "OpenAI GPT" for that result, and a one-time toast
  appears (§6.10).
- Basic Mode: a hollow dot with a 1px `--color-fg-subtle` ring and the label "Basic Mode, no AI". The
  popover says: "No AI provider is set up, so prompts come from local templates. Add
  ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY to the server environment to turn on AI."
- Under the editor, the provenance line repeats who wrote the current version: "Written by Claude
  Sonnet" or "Built with Basic Mode, no AI".

### 6.4 Follow-up questions

- Intro row: "3 questions to sharpen the prompt" (UI label, `--color-fg-muted`) on the left; the
  "Skip all" text button on the right. "Skip all" generates immediately with the answers given so far.
- Each question is a block of text with no box: the question (17px), then a single-line answer
  field (auto-grows to 3 lines) with an underline, then up to 3 suggestion chips. 32px between blocks.
  Questions are not numbered; they are not a sequence.
- "Skip" is a text button in `--color-fg-subtle`, aligned to the right on the question line.
- **Chips:** 32px tall (40px on touch), radius sm, 1px `--color-border-control` outline, 14px label,
  12px horizontal padding. Hover: `--color-surface-2` fill. Clicking a chip writes its text into the
  field (replacing what is there), marks the question answered, and moves focus to the next question's
  field. The chip matching the current answer is shown selected: accent outline, `--color-fg-strong`
  text. Chips wrap; on mobile they stack in a wrapping row.
- **Answered:** the question text keeps `--color-fg`, and a 12px check in `--color-fg-subtle` appears
  before the Skip slot, which becomes "Clear".
- **Skipped:** the field and chips collapse (§7). The question text turns `--color-fg-subtle`, and the
  right slot reads "Skipped" plus an "Undo" text button that reopens and focuses the field.
- **Keyboard:** focus starts in the first field. Enter moves to the next field (on the last one, it
  focuses Generate). Tab moves through the field, then its chips, then Skip. Ctrl/Cmd+Enter generates
  from anywhere. Alt+S skips the focused question. Esc in a field clears it, and pressing Esc again
  skips it.
- The footer shows Generate (primary) plus a live count "1 answered, 1 skipped" (`aria-live=polite`).
- With 0 questions, this block never renders; streaming starts directly.

### 6.5 Prompt editor and presentation

- A plain `<textarea>` (auto-height, no scrollbar of its own; the page scrolls) layered over a
  `pre`-like **tint layer** with identical font, size, padding, wrapping (`white-space: pre-wrap`,
  `overflow-wrap: anywhere`) and tab size. The textarea text is transparent with a visible caret; the
  tint layer renders the colors. What you copy is exactly the textarea value.
- Anatomy tint rules (color only, no weight or size changes):
  - XML-like tags `<context>`, `</context>`, `<example>`: `--color-tag`.
  - Markdown heading lines (`#`, `##`, `###` at line start): the `#` markers in `--color-fg-subtle`,
    and the heading text in `--color-fg-strong`.
  - List markers `-`, `*`, `1.` at line start, and `**` / `` ` `` delimiters: `--color-fg-subtle`.
  - Placeholders in square or curly brackets, `[your name]` / `{audience}`: `--color-accent`. These are
    slots the user must fill before pasting, so they deserve the accent.
  - All other text: `--color-fg`.
- No line numbers and no gutter. The 24px top padding aligns the first line with the title column.
- During streaming, the textarea is read-only and the tint layer shows the incoming text, with a
  static brass caret block (0.55em × 1.1em, radius 1px) after the last character. On `done`, the
  textarea becomes editable and the caret block disappears.
- Provenance line under the editor (meta size, `--color-fg-subtle`, items separated by 16px of space,
  not dots): "Written by Claude Sonnet", "Edited 2 min ago", "312 words".
- A manual edit commits a version after 1.5s idle or on blur. A quiet meta note "Saved as version 4"
  replaces "Edited ..." for 2s. No toast.

### 6.6 Toolbar

- Desktop (≥640): one row, 48px tall, sticky at `top: 56px`, background `--color-bg`. Its bottom hairline
  and shadow-float appear only when stuck. Order, left to right:
  1. Version switcher (§6.7)
  2. Spacer
  3. Refine group: ghost buttons with a 14px lucide icon and a label. Improve uses `PenLine`, Shorten
     `Minimize2`, Expand `Maximize2` and Regenerate `RotateCw`. No sparkle or wand icons, which read as
     generic AI. Buttons are 32px tall, radius sm, 2px apart, with a `--color-surface-2` hover fill.
  4. Tone ▾ (`DropdownMenu`: Neutral, Friendly, Professional, Direct, Playful, with a check on the
     tone used by the current version, or Neutral by default). Choosing one applies it immediately.
  5. 12px gap, then **Copy**: primary (accent fill, accent-on text, 36px tall, radius sm, `Copy` icon,
     label, and kbd hint "Ctrl ⇧ C" in accent-on at 70% opacity). Copy is the only filled button in the
     ready state.
  - Between 640 and 899, refine labels hide and only icons remain (tooltips carry the names and
    shortcuts). Copy keeps its label.
- Mobile (<640): the bottom bar has three items. Refine ▾ opens a bottom sheet listing Improve,
  Shorten, Expand and Regenerate, each with one-line descriptions. Tone ▾ opens the tone sheet.
  Copy is the filled button, taking the remaining width (min 44px tall).
- During a transform or a stream, refine and tone buttons are disabled (`aria-disabled`, 45% opacity)
  and the button that started it shows a 14px spinner in place of its icon. Copy stays enabled and
  copies the last committed version.
- **Basic Mode:** Improve, Shorten, Expand and Tone render disabled with `aria-disabled="true"` (still
  focusable so the reason can be read). The tooltip and an inline meta line under the toolbar say:
  "Improve, Shorten, Expand and Tone need an AI provider. Add an API key to the server to turn them
  on." Regenerate and Copy remain enabled.

### 6.7 Version switcher

`‹ Version 3 of 5 ›` plus the action name ("Improved") in `--color-fg-subtle`. The arrows are 28px
icon buttons; disabled at the ends. Clicking the label opens a popover listing versions, newest first:
"5 Edited, 2 min ago", "4 Tone: Friendly, 6 min ago", each with the engine in meta. Keyboard: Alt+[ and
Alt+] step through versions while the editor is not focused.

Viewing an older version: the editor is read-only and a line above it reads "Viewing version 2,
Shortened." with two text buttons, "Restore this version" (accent text) and "Back to latest".
Restoring creates a new version and shows the meta note "Restored as version 6".

### 6.8 Copy interaction

Sequence on click or Ctrl/Cmd+Shift+C:
1. 0ms: write to the clipboard (`navigator.clipboard.writeText`). On pointer press, the button scales
   to 0.97.
2. On resolve: the icon swaps `Copy` → `Check` and the label "Copy" → "Copied". Button width is
   fixed to the wider label, so nothing shifts. On pointer click this swap crossfades with a 2px blur
   over 160ms. On keyboard it swaps instantly.
3. At the same time (pointer and keyboard): the editor text area gets a `--color-accent-wash`
   background that fades out over 520ms, showing exactly what was copied. This is skipped under
   reduced motion, where the label change alone is enough.
4. `aria-live="polite"` announces "Prompt copied".
5. 1,600ms after resolve, the label returns to "Copy" (instant). A repeat copy within that window
   restarts the timer without re-animating.
6. If the copy fails: no label change. A toast says "Couldn't copy. Select the text and press Ctrl+C."
   and the editor text is selected for the user.

### 6.9 History rail

- Header: "History" (UI label) and a close icon button (`PanelLeftClose`) with the hint "Ctrl \".
- Search: an underline input, "Search prompts", with a `Search` icon. It filters as you type (no
  debounce animation). `/` focuses it while the rail is open.
- Filter: the same underline-segmented style as the platform control, smaller (12.5px): All, ChatGPT,
  Claude, Gemini.
- Groups: Today, Yesterday, Previous 7 days, Earlier. Group labels are meta size,
  `--color-fg-subtle`, sentence case, with 16px above.
- Rows: 36px tall (44px on touch), radius sm, 12px padding. Title on one line with ellipsis
  (`--color-fg`, 14px), relative time on the right (`--color-fg-subtle`, tabular). Hover:
  `--color-surface-2` fill, and the time is replaced by a `MoreHorizontal` menu button (Rename,
  Delete). Active (open prompt): `--color-surface-2` fill and a 2px brass bar at the left edge, inset
  6px top and bottom. Arrow keys move between rows; Enter opens; F2 renames; Delete deletes.
- Rename inline: the title becomes an input in place (same metrics, accent underline). Enter saves, Esc
  cancels, and blur saves. An empty name reverts.
- Delete: the row collapses (§7) and a toast says "Moved to Recently deleted" with an "Undo" action
  (6s).
- Footer: "Recently deleted" with a count, which swaps the list to deleted items. Each row has a
  "Restore" text button and a menu with "Delete forever". A note on top reads "Items here are deleted
  for good after 30 days." Back to the list via "Back to history".
- The rail background is `--color-surface` with a right hairline. On mobile it is a bottom sheet
  (92dvh, radius lg top corners, drag handle 36×4px in `--color-border-control`, drag or swipe down to
  close, and the sheet closes when a prompt is chosen).

### 6.10 Shortcut hints, sheet, toasts

- **Hints:** `<kbd>` elements next to the actions they trigger: 18px tall, 5px horizontal padding,
  radius xs, 1px `--color-border-control` outline, `--color-fg-subtle` text, kbd type. Show "Ctrl" on
  Windows/Linux and "⌘" on macOS. The New prompt hint shows "Ctrl N" or "Alt N" depending on which
  works in the current browser. Hints are hidden under 640px and on `(pointer: coarse)`.
- **Shortcut sheet (`?`):** a centered dialog, 520px, radius lg, surface, shadow-float, scrim. Title
  "Keyboard shortcuts". Two-column rows of action and keys: Generate or continue, Copy prompt, New
  prompt, Show or hide history, Skip question, Previous or next version, Search history, Show
  shortcuts. Esc closes it.
- **Toasts (Sonner):** bottom center on desktop (offset 24px), above the bottom bar on mobile. Surface,
  radius md, shadow-float, 14px, max 360px, one line plus an optional action text button in accent.
  Duration is 4s, 6s with an action, and errors stay until dismissed. At most 3 visible.

### 6.11 Empty, loading and error states

- Clarifying (waiting for questions): under the title, the meta line "Finding what matters" with 3
  skeleton lines at question-block height (`--color-surface-2`, radius xs, no shimmer loop; a static
  fill). After 8s: "Still working. Taking longer than usual."
- Streaming before the first token: the toolbar row shows "Writing with Claude Sonnet" and the brass
  caret block sits alone at the start of the editor.
- Inline error (keeps the previous text): a danger-colored line under the toolbar with a text button.
  "No provider could complete this request. Try again in a minute." [Try again]
- Fallback notice (toast): "Anthropic is rate-limited. Retried with OpenAI."
- Stopped mid-stream: meta note "Stopped. Kept what was written so far." The partial text becomes a
  version labeled Generated (partial).
- History empty: centered meta text "Prompts you generate are saved here automatically."
- Search empty: "No prompts match "{query}"." with "Clear search".
- Recently deleted empty: "Nothing deleted in the last 30 days."
- Storage unavailable: a one-line notice above the rail list: "History can't be saved in this browser
  mode. It will clear when you close the tab."

## 7. Motion

Tokens: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`,
`--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`. Exits are about 25% faster than entries. Hover effects
are gated by `(hover: hover) and (pointer: fine)`. Only transform, opacity, filter and clip-path
animate, plus height via Motion's `layout` where noted. Nothing loops.

| # | Trigger | What moves | Duration | Easing | Reduced motion |
| --- | --- | --- | --- | --- | --- |
| 1 | First page load (the one load moment) | composer line and settings row: opacity 0→1, y 6→0px; "Try one" follows 80ms later | 420ms | ease-out | opacity only, 200ms |
| 2 | Any button press | scale 1→0.97 on `:active` | 120ms | ease-out | none |
| 3 | Platform change | brass bar: `layoutId` slide between labels | spring `{ type: 'spring', duration: 0.32, bounce: 0 }` | n/a | instant |
| 4 | Generate (idea becomes title) | display composer opacity 1→0 with blur 0→2px (120ms), then title opacity 0→1 (180ms); content below moves with `layout="position"` | 300ms total | ease-out | opacity crossfade 150ms, no layout motion |
| 5 | Questions arrive | each block: opacity 0→1, y 8→0px; stagger 0, 45, 80, 110ms | 260ms | ease-out | opacity only, no stagger |
| 6 | Skip a question | field and chips: height to 0 and opacity 1→0 (opacity finishes at 60%); "Skipped" fades in 120ms | 200ms | ease-in-out (height), ease-out (opacity) | instant |
| 7 | Questions leave on generate | the questions group collapses to the "2 answers Show" line: opacity 1→0, height animate | 220ms | ease-in-out | instant |
| 8 | Streaming text | no animation per token; caret block moves with the text | n/a | n/a | same |
| 9 | Version switch or transform done | editor text crossfade: opacity 0.4→1 with blur 2px→0 on the new text | 180ms | ease-out | opacity only, 120ms |
| 10 | Copy (pointer) | label crossfade with blur 2px (§6.8) | 160ms | ease | instant swap |
| 11 | Copy (any) | editor wash: accent-wash opacity 1→0 | 520ms | ease-out | skipped |
| 12 | Popover / menu / tooltip open | opacity 0→1, scale 0.97→1, `transform-origin: var(--radix-popper-transform-origin)` | 160ms (tooltip 125ms); exit 110ms | ease-out | opacity only |
| 13 | Tooltip after one is open | none (`data-instant`) | 0 | n/a | n/a |
| 14 | History toggle via Ctrl+\ | none: rail appears and the column re-centers instantly (keyboard action) | 0 | n/a | n/a |
| 15 | History toggle via button (≥900) | rail: x -16px→0 with opacity; column: `layout` shift | 240ms in, 180ms out | ease-drawer | opacity only |
| 16 | Mobile sheet open/close | y 100%→0; follows the finger 1:1 while dragging; dismisses past 30% height or velocity >0.4 px/ms | 360ms in, 260ms out | ease-drawer | opacity 200ms |
| 17 | Delete history row | row height to 0 and opacity to 0; rows below follow via `layout` | 200ms | ease-in-out | instant |
| 18 | Toast | Sonner defaults: y from bottom with opacity | 400ms | ease | opacity only |
| 19 | Shortcut sheet | opacity 0→1, scale 0.98→1 from center; scrim opacity | 200ms in, 150ms out | ease-out | opacity only |
| 20 | Theme switch | none (an instant swap, with transitions disabled during the change) | 0 | n/a | n/a |

## 8. Microcopy

Sentence case, plain verbs. An action keeps its name through the flow (Copy → Copied, Restore →
Restored, Delete → "Moved to Recently deleted").

- Header: "PromptHub", "New prompt", "Show history" / "Hide history" (accessible labels for the rail
  button), "Keyboard shortcuts" (`?` label), "Switch to light theme" / "Switch to dark theme".
- Engine: "Claude Sonnet", "OpenAI GPT", "Gemini Flash", "Basic Mode, no AI", the popover texts in
  §6.3, "Written by {engine}", "Built with Basic Mode, no AI".
- Composer: placeholder "Describe what you want the AI to do"; helper "Rough is fine. You can refine
  it after."; "Generate prompt"; "Try one"; examples "Write a cold email to my landlord about a broken
  heater", "Explain a SQL query to a new analyst", "Plan a 3-day trip to Lisbon on a budget";
  "Regenerate from this idea"; counter "{n} / 4,000"; at cap "Ideas can be up to 4,000 characters."
- Settings: "For", "ChatGPT", "Claude", "Gemini", "Concise", "Balanced", "Detailed", length
  descriptions in §6.2, "Regenerate for {platform}", "Regenerate as {length}".
- Questions: "{n} questions to sharpen the prompt" ("1 question to sharpen the prompt"), "Skip",
  "Skip all", "Skipped", "Undo", "Clear", answer placeholder "Type an answer or pick one", footer
  count "{a} answered, {s} skipped", collapsed summary "{n} answers" + "Show" / "Hide", loading
  "Finding what matters", slow "Still working. Taking longer than usual."
- Streaming: "Writing with {engine}", "Stop", "Stopped. Kept what was written so far."
- Toolbar: "Improve", "Shorten", "Expand", "Regenerate", "Tone", tones "Neutral", "Friendly",
  "Professional", "Direct", "Playful", "Copy", "Copied", "Refine" (mobile), Basic Mode reason
  "Improve, Shorten, Expand and Tone need an AI provider. Add an API key to the server to turn them
  on."
- In-progress labels (aria-live): "Improving", "Shortening", "Expanding", "Regenerating", "Changing
  tone to {tone}".
- Version names: "Generated", "Improved", "Shortened", "Expanded", "Regenerated", "Tone: {tone}",
  "Edited", "Restored", "Generated (partial)".
- Versions: "Version {n} of {total}", "Previous version", "Next version", "Viewing version {n},
  {action}.", "Restore this version", "Back to latest", "Restored as version {n}", "Saved as version
  {n}".
- Editor meta: "Edited {time}", "{n} words".
- Copy: "Prompt copied" (live region), "Couldn't copy. Select the text and press Ctrl+C." (⌘C on
  macOS).
- History: "History", "Search prompts", "All", "Today", "Yesterday", "Previous 7 days", "Earlier",
  "Rename", "Delete", "Moved to Recently deleted", "Undo", "Recently deleted", "Back to history",
  "Restore", "Restored", "Delete forever", "Deleted for good", "Items here are deleted for good after
  30 days.", empty states in §6.11, "Done" (mobile sheet close).
- Errors: "No provider could complete this request. Try again in a minute.", "Try again", "{Provider}
  is rate-limited. Retried with {Provider}.", "{Provider} didn't respond. Retried with {Provider}.",
  "The connection dropped while writing. Kept what was written so far.", "Too many requests. Wait a
  minute and try again.", "This prompt is over 20,000 characters. Shorten it to keep editing."
- Shortcut sheet: "Keyboard shortcuts", "Generate or continue", "Copy prompt", "New prompt", "Show or
  hide history", "Skip question", "Previous or next version", "Search history", "Show shortcuts",
  footnote "If Ctrl N opens a new window, use Alt N."

## 9. Review against generated-design defaults

| Tell (frontend-design) | This plan |
| --- | --- |
| 1. Cream ground, high-contrast serif, terracotta accent | Avoided. Dark spruce ground, a light theme that is a cool green-grey (`#F2F4F1`) rather than cream, no serif, brass rather than clay. |
| 2. Near-black with one acid-green or vermilion accent | This is the closest risk, since the brief asks for dark-first with one accent. Handled by tinting the ground clearly (spruce `#121816`, visibly green beside neutral black) and choosing a low-chroma brass. A second functional hue (`--color-tag`) exists for structure, so the page is not a single-shout palette. |
| 3. Broadsheet hairlines, zero radius, dense columns | Hairlines are used only where structure exists (rail edge, stuck toolbar). Radii follow a 3/6/10/16 hierarchy. One airy column. |
| 4. SaaS-card kit | No cards. Composer, questions and editor have no containers; grouping is spacing. Only floating layers get the single shadow. No gradients. |
| 5. Template chrome (caps eyebrows, middle-dot meta, "WORD — fragment", #111, mono labels, "→" buttons) | Avoided. Sentence-case labels, meta separated by space or commas ("ChatGPT, Balanced"), no em-dash labels, no #111 (grounds are tinted), no mono anywhere (kbd uses condensed Mona Sans with tabular figures), no arrows in button text. Section labels appear only where they carry information (question count, history groups). |

What changed from the first draft, and why:
1. **Ground and accent.** Draft 1 was neutral graphite `#141414` with an electric indigo `#7C83FF`
   accent. That is tell 2 plus the default "AI purple". Changed to spruce and brass, which is specific,
   warm without being clay, and keeps AA in both themes.
2. **Typefaces.** Draft 1 paired Geist (the Next.js default) with Geist Mono for meta and kbd. That is a
   default face plus tell 5. Changed to one family, Mona Sans, using its width axis for hierarchy, which
   also satisfies "no obligatory serif".
3. **Questions.** Draft 1 put each question in a rounded card with a numbered "01/02/03" badge. The
   questions are not a sequence, and cards are tell 4. Changed to unboxed blocks with underline fields
   and outlined chips.
4. **Platform picker.** Draft 1 used pill segments with a filled sliding background. That is the
   generic control. Changed to a text-only underline control with a brass bar, read as "For ChatGPT",
   which also states what the setting means.
5. **Boldness budget.** Draft 1 spent it twice (a large hero headline above the composer, plus a glow on
   Generate). Merged into one move: the composer is the headline. The glow was removed.
6. **Copy feedback.** Draft 1 used a toast for "Copied". Changed to an in-place label swap plus an
   editor wash, so the confirmation appears where the user is looking and shows what was copied.
7. **Mobile toolbar.** Draft 1 kept a horizontal scrolling toolbar on top. Changed to a bottom action
   bar with safe-area padding, Refine and Tone sheets, and Copy as the wide primary within thumb reach.
