# Direction C: Interlock

Preview: `/design/c` (state switcher at the top, or `?state=empty|questions|generating|result|copied|history|signed-in`;
add `&slow=4` to the generating state to watch the build in slow motion).
Code: `src/app/design/c/*`, `src/components/design/c/*`. Styles: `src/components/design/c/interlock.css`, every class
prefixed `dc-`, every token declared on `.dc-root` (the project's Turbopack rule compiles all `.css` as global CSS, so
CSS modules aren't available; the prefix and the `styles.ts` class map stand in for them).

## 1. Concept

**A prompt is a build.** PromptHub's output is not a paragraph, it's a structure: role and task, context,
requirements, constraints, output. Interlock makes that structure the product's visible identity. The prompt is
shown as a stack of labelled pieces that physically connect: each piece has a notch at the top and a nub at the
bottom, and the nub of one drops into the notch of the next. You watch them snap together when the prompt is
written, you edit inside them, and when you copy, a charge runs down the spine.

The same connector is the brand mark (a cobalt piece snapped onto an ink piece), the "Your idea" piece that sits on
the composer, and the active-row marker in history. It is the one recurring shape, and it says what the product
does: it takes a rough idea and assembles it into parts a model can read.

Around it everything is a calm, precise productivity tool: a cool mid-grey canvas, white working sheets, one dark
graphite plane for history and the command palette, a single cobalt for action and focus, and three platform
colours that tint the blocks so the model choice is visible everywhere.

It deliberately avoids: a sidebar of icons, card grids, gradient washes, glow, AI purple, acid green, terracotta,
cream, all-caps labels, mono data labels and middle-dot meta strings.

## 2. Palette

Contrast is WCAG 2.x, computed with the relative-luminance formula. "Fog" is the canvas, "Paper" the working sheet.

### Light (default for this direction)

| Name | Token | Hex | Role | Contrast |
| --- | --- | --- | --- | --- |
| Fog | `--fog` | `#DCDFE4` | canvas, the base plane | n/a |
| Paper | `--paper` | `#FFFFFF` | working sheets: composer, prompt, questions, popovers | n/a |
| Mist | `--mist` / `--mist-2` | `#EDEFF2` / `#E3E6EA` | segment tracks, chip fill, focused block well | n/a |
| Graphite | `--graphite` | `#1F2229` | the dark plane: history, command palette, toasts, avatar | n/a |
| Graphite 2 / 3 | | `#2B2F38` / `#363B46` | selected row, inputs and hairlines on graphite | n/a |
| Ink | `--ink` | `#15181F` | headings, body, prompt text | 17.76 on Paper, 13.29 on Fog |
| Ink 2 | `--ink-2` | `#434956` | secondary text, syntax hints on tints | 9.03 Paper, 6.76 Fog, 7.71 to 7.93 on platform tints |
| Ink 3 | `--ink-3` | `#5A606D` | meta, helper, hints | 6.31 Paper, 4.72 Fog, 5.04 Mist 2 |
| Line | `--line` | `#CDD1D8` | decorative hairlines, dashed ghost rules | decorative |
| Line control | `--line-control` | `#8A909C` | input outline, dashed "needs AI" border | 3.21 on Paper (non-text 3:1) |
| **Cobalt** (brand) | `--cobalt` | `#2D3BD6` | primary button, focus ring, "Your idea" piece, brand mark, progress | white on it 7.75; on Fog 5.80 |
| Cobalt hover / press | | `#2330BE` / `#1D28A3` | primary hover and press | |
| Cobalt wash | `--cobalt-wash` | `#E8EAFC` | selected chip, focus halo, selection | Ink on it 14.89 |
| On graphite | | `#F2F3F5` / `#B5BBC6` / `#969DAB` | text on the dark plane | 14.34 / 8.25 / 5.84 on Graphite; 4.92 on Graphite 2 |

**Platform colours.** Each target owns a hue, used as a solid (switch underline, dots, copy sweep), a tint (the
block pieces) and a deep shade (labels on the tint). None of them are vendor colours: ChatGPT is not green or black,
Claude is not terracotta, Gemini is not blue or violet.

| Platform | Solid | Tint | Deep (label on tint) | On graphite | Checks |
| --- | --- | --- | --- | --- | --- |
| ChatGPT, "Raspberry" | `#C2255C` | `#FCE8EF` | `#9E1B4A` (6.62) | `#FF7FAE` (6.75; 5.68 on selected row) | white on solid 5.66 |
| Claude, "Lagoon" | `#0B7A75` | `#E2F3F1` | `#0A615D` (6.36) | `#4CC8BF` (7.82; 6.59) | white on solid 5.18 |
| Gemini, "Ochre" | `#A35F00` | `#FBEFD9` | `#7A4700` (6.76) | `#E8AE45` (8.01; 6.75) | white on solid 5.01 |

Platform dots are graphical (3:1 rule): 4.23, 3.88 and 3.75 on Fog.

### Dark

Built and switchable in the preview (top-right of the switcher). Same structure, inverted planes: the graphite
plane goes darker than the canvas so history still reads as its own layer.

| Name | Hex | Check |
| --- | --- | --- |
| Night (canvas) | `#1A1D23` | Ink `#F2F3F5` on it 15.21 |
| Paper | `#252931` | Ink 2 `#BFC4CE` 8.33, Ink 3 `#9097A3` 4.96 |
| Mist / Mist 2 | `#30353F` / `#3A404B` | |
| Graphite plane | `#14161B` | On-graphite 3 6.64 |
| Cobalt | `#6E79FF` with ink `#0E1130` on it | 5.12; focus ring `#7C86FF` 4.66 on Paper |
| Platform solids | `#FF7FAE`, `#4CC8BF`, `#E8AE45` | 6.18, 7.17, 7.34 on Paper |
| Platform tints / deep | `#3D2230`/`#FF9CC0`, `#183634`/`#7FDCD5`, `#3A2E17`/`#F1C677` | 7.33, 8.11, 8.27 |

Rule: cobalt fills one control per view (Generate or Copy). Platform colour never fills a button; it marks
"which model this is for". Red is reserved for danger text.

## 3. Typography

Two families with real contrast, both via `next/font/google` in `src/app/design/c/layout.tsx`:

- **Funnel Display** (`Funnel_Display`, variable `wght` 300 to 800, `--c-font-display`). A display grotesk with
  funnel-cut joins and a slightly mechanical rhythm. It suits the "assembled parts" idea and is not one of the
  over-used AI defaults (Inter, Space Grotesk, Fraunces, Instrument Serif). Used for the idea, sheet titles, block
  labels, the wordmark and avatar initials.
- **Schibsted Grotesk** (`Schibsted_Grotesk`, variable `wght` 400 to 900, `--c-font-text`). A sturdy newsroom
  grotesk with open counters: comfortable for long prompt text and crisp at 13px in controls.

| Role | Family | Size / line | Weight | Tracking |
| --- | --- | --- | --- | --- |
| Idea, empty composer | Funnel Display | 36/42 (tablet 30/36, mobile 27/33) | 560 | -0.025em |
| Idea title, result (the anchor that stays) | Funnel Display | 32/37 (compact 24/30, mobile 21/26) | 620 | -0.025em |
| Active question | Funnel Display | 21/27 (mobile 19/25) | 620 | -0.015em |
| Sheet title, history title | Funnel Display | 18/24, 19/24 | 650 | -0.015em |
| Block label | Funnel Display | 14.5/18 | 680 | -0.01em |
| Wordmark | Funnel Display | 19/24 | 700 | -0.02em |
| Prompt text (block body, plain view) | Schibsted | 16/26 | 420 | 0 |
| Answer input, search on mobile | Schibsted | 16 | 400 | 0 (16px stops iOS zoom) |
| Controls (buttons, segments, rows) | Schibsted | 14/20, segments 13.5 | 560 to 600 | 0 |
| Meta, hints, syntax line | Schibsted | 12 to 13/16 to 18 | 450 to 520 | 0 |
| Kbd | Schibsted | 11.5/16, tabular | 600 | 0, keycap with a 2px bottom edge |

The ratio from body to idea title is 2:1, so the page keeps a strong anchor after a prompt exists (audit point 3).
Prompt text stays under about 75 characters per line in the 1440 sheet.

## 4. Planes, surfaces and depth

Four planes, each with its own tone and edge:

1. **Canvas (Fog `#DCDFE4`)**: a mid-light cool grey. Everything that is "the room".
2. **Working sheets (Paper)**: radius 20 (16 mobile), shadow `0 1px 0 /4%, 0 1px 2px /6%, 0 8px 24px -12px /18%`.
   The composer, the prompt and the questions live here. The prompt sheet is the largest white mass on screen.
3. **Raised controls**: segment thumbs and secondary buttons are white on mist tracks with a 1px top highlight
   (`inset 0 1px 0 #fff/70%`) and a 1 to 3px drop. Tracks are inset (`inset 0 1px 2px`). It reads as a physical switch.
4. **The dark plane (Graphite)**: history, command palette, toasts and the avatar. It is the one dark mass, so the
   eye has a light/dark structure to organise around (audit point 2). Floating layers use
   `0 16px 40px -12px /32%`.

No gradients. The only patterned fill is the skipped segment in the question progress bar (a 135deg hatch), which
encodes "skipped" rather than decorating.

## 5. Navigation and history

- **Top bar (64px, on the canvas)**: brand mark and wordmark (click for a new prompt), the command field "Search or
  run a command  Ctrl K", then the engine label "Basic Mode, no AI" with a hollow ring dot (opens the popover with
  the existing Basic Mode text), History, New prompt, and the account control ("Sign in with Google" or the avatar).
- **Command palette (Ctrl/⌘ K)**: graphite, centred at 14vh, input plus a listbox. Commands: New prompt,
  Show/Hide history, Copy prompt, Write for {platform}, Make it {length}, Open "{history item}", Switch theme.
  Arrow keys, Enter, Esc. It never animates: it's opened many times a day.
- **History (desktop and tablet)**: a graphite panel, 320px (300 at tablet), sticky, docked in the left column. It
  takes the brief column's place; the idea and both switches collapse into a compact strip above the sheet, so
  nothing is lost. Search, a four-way platform filter (All, ChatGPT, Claude, Gemini, each with its dot), groups
  Today / Yesterday / Previous 7 days / Earlier. A row shows the title, the platform name in its colour, the
  version count and the time. The selected row gets a 4px platform-coloured spine, the same idea as the block
  pieces. Empty search: `No prompts match "x".`
- **History below 900px**: a bottom sheet (86dvh, graphite, radius 22) over a scrim, dragged closed from its handle
  (distance > 120px or velocity > 500px/s), Esc or the close button.
- **Account (signed in)**: avatar with initials "MS" on graphite, ring turns cobalt when open. The menu shows a 44px
  avatar, "Maya Shah", "maya.shah@example.com", then "Account settings" and "Sign out". Arrow keys move, Esc
  closes and returns focus, click outside dismisses. In the preview "Account settings" explains it isn't built yet.

## 6. The editor (block view)

- Each section of the rendered prompt becomes a block: a **piece** (150px, platform tint, label in Funnel Display,
  the exact syntax below it: `## Context` for ChatGPT and Gemini, `<context>` for Claude, "Plain paragraph" for the
  opening) and a **body** you edit in place.
- Pieces stretch to the height of their text, so the spine shows the prompt's proportions at a glance (a long
  Requirements piece means a long requirements section).
- Parsing is lossless: `joinBlocks(parseBlocks(text)) === text` for every brief, platform and length in
  `MOCK_BRIEFS` (checked during the build). Editing a body rewrites only that section.
- **Plain text** view is one textarea of the full prompt, for people who want to edit it as a document.
- First edit on a version creates "Edited" and says "Saved as version {n}"; later keystrokes stay in it.
- The version switcher sits in the sheet header: previous, "Version 2 of 2", next, and the version name. Viewing
  an older one shows "Viewing version 1, generated." with "Restore this version" and "Back to latest".
- Under the blocks: the refine row and the provenance line "Built with Basic Mode, no AI", word count and the
  platform tip ("Uses XML tags and clear sections, the way Claude reads best.").
- Mobile: pieces become a horizontal label bar (label left, syntax right, nub hanging from its bottom-left) above
  the body, so text gets the full width.

## 7. Platform and length

The **platform switch** is the tactile control: an inset track, a raised white thumb that springs between options
(`spring, duration 0.36, bounce 0.22`, shared `layoutId`), a square dot in each platform colour that grows on hover
and squashes on press, and a 4px platform-coloured nub hanging under the thumb, the same connector as the blocks.
Choosing a platform re-tints every piece, updates the syntax lines, re-renders the prompt through `renderPrompt`,
and the blocks reorder with a layout spring when the order changes (Gemini puts constraints and output first).
In this preview the latest unedited version re-renders in place; an edited one gets a new "Regenerated" version
so edits are never lost.

Length is a neutral segmented control with the existing descriptions ("Enough context for good results").

## 8. Clarifying questions: a short guided stepper

One sheet, titled "{n} questions to sharpen the prompt", with "Skip all" and a segmented progress bar (cobalt =
answered, hatched = skipped, outlined = current). Each question is a numbered step (numbers are earned: it is a
real sequence). Answered steps collapse to the question in grey and the answer in ink with a cobalt check, plus
"Change". Skipped steps say "Skipped" with "Undo". The current step expands: the question in Funnel Display, an
input ("Type an answer or pick one"), suggestion chips, "Save answer" and "Skip". Picking a chip fills the input,
shows the selected state for 180ms, then advances to the next open step. The footer keeps "Generate prompt" and
"1 answered, 1 skipped" live.

## 9. The generation moment

Basic Mode is instant, so the moment is a short, honest build of the real text, not a fake wait:

| Element | Role | Starts | Motion |
| --- | --- | --- | --- |
| Status "Writing with Basic Mode, no AI" + "{n} of {total} blocks" | Lead (announced) | 0ms | none; three bars pulse in the platform colour |
| Piece 1 to n | Lead | 0, 140, 250, 340, 410ms (gaps shrink) | drop 18px and settle: spring 0.42s, bounce 0.32; scale 0.97 to 1 |
| Body text | Support | piece + 100ms | wipe in left to right, `clip-path inset(0 100% 0 0)` to 0, 420ms ease-out `(0.23,1,0.32,1)` |
| Sheet, brief column | Static | n/a | n/a |

The sheet is full height from the start, so nothing jumps when the last piece lands. Total under one second, then
the toolbar is there. "Stop" ends it and keeps what's placed. In a real AI stream the same parser runs on the
streamed text, so each piece drops in as its heading arrives. Reduced motion: pieces fade in together in 200ms.

## 10. The copy moment

Copy is the user's goal, so it gets the strongest feedback in the product, in three synced layers:

1. **Button**: press scales to 0.97; on resolve the icon and label crossfade Copy to Check/Copied with a 2px blur
   (160ms). Width is fixed so nothing shifts.
2. **The charge**: each piece flashes from tint to its solid platform colour (white label) and back, lifting 2px,
   top to bottom, 620ms each, about 50ms apart (WAAPI, so it runs on the compositor).
3. **Settle**: the sheet gets a 2px cobalt outline and the header reads "Copied 170 words for ChatGPT. Paste it into
   a new chat." for 2.4s, so you can see exactly what went to the clipboard.

`aria-live` announces "Prompt copied". Failure shows a toast: "Couldn't copy. Select the text and press Ctrl+C."
Reduced motion: no lift or sweep, a single cobalt-wash fade on all pieces at once.

## 11. Buttons and controls

| Control | Rest | Hover (fine pointer only) | Press | Focus | Disabled |
| --- | --- | --- | --- | --- | --- |
| Primary (cobalt) | fill, 1px top highlight, cobalt bottom edge, soft cobalt shadow | darker fill, shadow grows | scale 0.97, darker, inset shadow | 2px cobalt ring, 2px offset | mist fill, Ink 3 text, no shadow: clearly off |
| Secondary | white, 1px line, top highlight | border darkens, shadow lifts | scale 0.97 | ring | n/a |
| Ghost | text only | 6% ink wash | scale 0.97 | ring | 40% via disabled |
| Needs AI (Basic Mode) | transparent, **dashed** control border, lock icon, Ink 3 | none | none | ring | `aria-disabled`, reason shown under the row and on click |
| Chip | mist fill, 1px bottom line | lifts 1px, white, shadow | scale 0.96 | ring | n/a |
| Chip selected | cobalt wash, cobalt border | | | | |
| Platform option | label in Ink 2 | dot scales 1.25 | dot squashes 0.8 | ring | n/a |
| History row | none | graphite 2 | | ring in `#7C86FF` | n/a |

"Needs AI" is dashed and unfilled; secondary is solid and filled. You can tell them apart without reading.

## 12. Motion spec

Curves: `--ease-out cubic-bezier(0.23,1,0.32,1)`, `--ease-in-out cubic-bezier(0.77,0,0.175,1)`,
`--ease-drawer cubic-bezier(0.32,0.72,0,1)`. No `ease-in`, no `transition: all`, no `scale(0)`.

| Interaction | Tool | Values |
| --- | --- | --- |
| Button / chip press | CSS transition | transform 160ms ease-out, scale 0.97 / 0.96 |
| Colour hovers | CSS transition | 150ms ease, gated by `(hover: hover) and (pointer: fine)` |
| Platform and segment thumb | Motion `layoutId` | spring 0.36s, bounce 0.22 |
| Block reorder on platform change | Motion `layout="position"` | spring 0.4s, bounce 0.15; exits fade 120ms (`popLayout`) |
| Generation | Motion | see §9 |
| Copy label swap | Motion `AnimatePresence popLayout` | 160ms, opacity + scale 0.9 + 2px blur |
| Copy charge | WAAPI | 620ms per piece, ~50ms stagger, ease-out |
| Copied outline | CSS transition | box-shadow 220ms ease-out |
| Engine popover, account menu | Motion | 160 to 180ms ease-out from scale 0.96, origin top right; exit 100 to 120ms |
| History panel (docked) | Motion | x -24 to 0 + fade, 300ms drawer curve; exit 160ms |
| Bottom sheets | Motion + drag | y 100% to 0, 450ms drawer curve; exit 240ms; drag from handle, dismiss on 120px or 500px/s |
| Toast | Motion | 400ms ease, rises 16px; leaves the way it came |
| Command palette, keyboard shortcuts, list navigation | none | frequent actions never animate |

`MotionConfig reducedMotion="user"` plus explicit `useReducedMotion` branches: transforms drop out, opacity stays,
choreography collapses to one fade.

## 13. Composition

### Desktop 1440

```
┌ Direction C preview: Empty Questions Generating Result Copied History Signed in              Dark ┐
│ [■] PromptHub   [⌕ Search or run a command   Ctrl K]     ○ Basic Mode, no AI  History  [+ New] (MS)│
│                                                                                                   │
│   [Your idea]                           ┌──────────────────────────────────────────────────────┐  │
│   Write a cold email to                 │ ‹ Version 2 of 2 ›  Edited     [Blocks|Plain] [Copy] │  │
│   my landlord about                     ├──────────────────────────────────────────────────────┤  │
│   a broken heater         (32px)        │ ┌Role and task┐ Act as a tenant who knows…           │  │
│   ✎ Edit idea                           │ └─────┬───────┘                                      │  │
│                                         │ ┌─────┴───────┐ - Audience: a landlord I rarely…     │  │
│   For          Uses Markdown sections…  │ │Context      │ - The heater stopped working…        │  │
│   [▪ChatGPT|▪Claude|▪Gemini]            │ └─────┬───────┘                                      │  │
│      ‾‾‾‾ platform nub                  │ ┌─────┴───────┐ - Ask for a repair within 48 hours.  │  │
│   Length       Enough context…          │ │Requirements │ …                                    │  │
│   [Concise|Balanced|Detailed]           │   … Constraints, Output                              │  │
│   ─────────────                         ├──────────────────────────────────────────────────────┤  │
│   1 answered, 1 skipped                 │ [🔒Improve][🔒Shorten][🔒Expand][🔒Tone]  [Regenerate] │  │
│   What outcome…  Repair within 48 hours │ Improve, Shorten, Expand and Tone need an AI provider…│  │
│   Ctrl K runs any command               │ Built with Basic Mode, no AI   170 words   Uses…      │  │
│   brief column 340–420                  └──────────────── sheet up to 820 ──────────────────────┘  │
```

Empty: the left column is the composer (cobalt "Your idea" piece, 36px idea field, "Generate prompt  Ctrl ↵"),
switches and "Try one"; the right is the build plate showing the five pieces it will fill, each with a plain
description, tinted for the selected platform. History: the graphite panel takes the left column.

### Tablet 1024

```
┌ [■] PromptHub  [⌕ Ctrl K]          ○ Basic Mode, no AI  History  [+]  [G Sign in with Google] ┐
│ Write a cold email to my landlord about a broken heater      (24px compact brief)              │
│ [▪ChatGPT|▪Claude|▪Gemini] [Concise|Balanced|Detailed]                                         │
│ ┌──────────────── sheet, full width up to 760 ─────────────────────────────┐                    │
│ │ ‹ Version 2 of 2 › Edited            [Blocks|Plain text] [Copy]          │                    │
│ │ [Role and task]  Act as a tenant…                                        │                    │
```

Empty keeps two columns (composer 300 to 380, plate fills the rest) so the signature is in the first view. History
docks at 300 with the compact brief beside it.

### Mobile 390

```
┌ [■] PromptHub          ⟲  (MS) ┐
│ Write a cold email to my       │  21px, the prompt stays the hero
│ landlord about a broken heater │
│ [▪ChatGPT|▪Claude|▪Gemini]     │
│ ┌────────────────────────────┐ │
│ │○ Basic Mode, no AI [Blocks|Text]│
│ │[Role and task   Plain para]│ │  label bar with nub
│ │Act as a tenant who knows…  │ │
│ │[Context        ## Context] │ │
│ │- Audience: …               │ │
│ └────────────────────────────┘ │
│ ┌ ⚙ Refine   ‹ 2 of 2 ›  [Copy] ┐│  floating white bar, 52px, safe-area aware
└────────────────────────────────┘
```

The action bar is white and small; the prompt keeps the dark-on-white mass (audit point 7). Refine opens a light
bottom sheet with length and the AI actions (disabled with the reason) plus Regenerate. History is the graphite
bottom sheet. The composer keeps the engine label visible under the idea card.

## 14. How this fixes the audit

| Audit finding | Interlock |
| --- | --- |
| 1. One plane, no hierarchy | Four planes: Fog canvas, Paper sheets, raised controls on inset tracks, Graphite plane. The prompt is the largest white sheet with a real shadow. |
| 2. Almost monochrome | Light canvas, white sheets, one graphite mass; cobalt for action; three platform hues that tint the whole prompt. |
| 3. One voice, sizes cluster | Funnel Display vs Schibsted Grotesk; idea title stays 32px after generation (2:1 over body); block labels give mid-level hierarchy. |
| 4. Low affordance | Filled primary with edge and lift; raised secondary; dashed "needs AI" with lock and reason; tactile platform switch with colour; chips with fill, lift and selected state. |
| 5. No events | Questions become a stepper with progress; generation is a piece-by-piece build; copy has a button morph, a charge down the spine and a settled outline. |
| 6. No composition | Asymmetric brief/sheet split with the idea as a large anchor on the left and the build on the right; empty state shows the plate before you type. |
| 7. No identity | A mark built from the connector shape, the connector on every block, on the idea piece, on the switch thumb and in history rows. Cobalt plus three platform hues. |
| Mobile | Prompt is the hero, label bars keep text full-width, small floating action bar, sheets for history and refine. |

## 15. Self-review against the frontend-design defaults

| Default tell | Status |
| --- | --- |
| Cream + serif + terracotta | Avoided: cool grey, two grotesks, cobalt. |
| Near-black + acid accent | Avoided: light-first; dark mode uses cobalt and platform hues, no neon. |
| Broadsheet hairlines | Avoided: rounded sheets with depth; hairlines only where they separate header/body/footer. |
| SaaS card kit | Risk, and handled: only one sheet per column, radii follow size (5 kbd, 8 to 10 controls, 9 pieces, 14 popovers, 20 sheets, 22 bottom sheets). Blocks are not cards: they are the prompt's literal sections and they connect. |
| All-caps eyebrows | None. Labels are sentence case and only where they name a control ("For", "Length", "Try one"). |
| Middle-dot meta | None: meta is spaced spans ("Built with Basic Mode, no AI   170 words"). |
| Mono for small labels | None: the syntax line (`## Context`, `<context>`) is set in the text face, it shows format, not code. |
| "→" in buttons | None. |
| Sparkles for AI | Removed (see below). |
| Numbered markers without a sequence | Numbers appear only on the question steps, which are a sequence. |

**What I revised during the build**

1. **Platform colours.** The first plan had Gemini in amber and the brand as a second marigold; one hue was doing two
   jobs. Dropped the second brand colour; marigold became Ochre for Gemini only, and "Copied" uses cobalt.
2. **Command field.** Centred absolutely in the bar, it collided with the engine label at 1440. Moved into the flow
   after the wordmark; at tablet it collapses to the icon and `Ctrl K`.
3. **The composer read as a generic white card.** Added the cobalt "Your idea" piece with its nub, so the first
   thing you touch is the first piece of the build and matches the mark.
4. **Sparkles on "Try one".** A stock AI tell; replaced with a plain "insert" arrow.
5. **Parser.** Claude prompts with single-line or nested tags (`<constraints>…</constraints>`, `<material>` with
   `<source>`) broke into a "Note" block. Rewrote it to match top-level sections only and verified a lossless
   round-trip for all 72 brief, platform and length combinations.
6. **Copied state had no visible settled state** in a still frame. Added the cobalt sheet outline and the
   "Copied 170 words for ChatGPT" header line.
7. **History filters wrapped** to two lines at 320px; turned them into a four-way grid.
8. **Tablet first impression lost the build plate** below the fold; empty state now stays two-column down to 900px.
9. **Mobile lost the engine label**; it now sits in the prompt sheet header and under the composer.
10. **Tabular figures turned the comma in "1 answered, 1 skipped" into a wide glyph**; removed `tnum` there.
11. **On-graphite meta** measured 4.24:1 on the selected row; lifted to `#969DAB` (4.92).

## 16. Known gaps

- Account settings is not designed; the preview says so instead of faking a page.
- Recently deleted, rename and delete in history are not in this preview (the existing DESIGN.md behaviour applies).
- The tone picker is shown only as a disabled "Tone" action; its open state with AI on is not designed here.
- The copy charge and drag-to-dismiss need a check on a real phone and at 2 to 5x speed (`&slow=` covers the build
  only).
