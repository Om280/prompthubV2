# Direction A: "Proof"

A bold, modern editorial writing studio. Preview: `/design/a` (`?state=empty|questions|generating|result|copied|history|signed-in`).
Code: `src/app/design/a/**`, `src/components/design/a/**`.

## 1. Concept

PromptHub works like a type foundry's proofing room. You write your idea in huge display type on a grey
press desk. PromptHub then pulls a **proof**: a white sheet with real depth, set in a book serif, marked
with printer's crop marks and an index tab in the colour of the platform it was set for. You correct
the proof, then you **copy it**, and the crop marks close in on the sheet as if it had just been trimmed.

The subject gives us the materials: paper, ink, a press desk, process inks, crop marks, an index tab,
proof marks. Nothing is borrowed from "AI" imagery (no sparkles, no glows, no gradients as decoration).

**Signature device: the crop mark.** It is the brand mark (a P set inside two crop corners), it frames
the empty composer (the "plate"), it sits outside each corner of the proof sheet, and it is the copy
moment (marks snap inward and turn ultramarine). One recurring shape, four jobs.

**Signature colour moment: the platform ink.** Each target platform has its own press ink. Choosing a
platform floods its swatch, colours the sheet's index tab and top edge, the ink roller during
generation, and the prompt's structural markup (XML tags, Markdown headings). You can see which model a
prompt is for from across the room.

## 2. Palette

Light-first. The desk is a cool press grey, the paper is pure white, the ink is blue-black. Not cream,
not terracotta, not near-black-plus-acid.

### Core

| Name | Hex | Role |
| --- | --- | --- |
| Paper | `#FFFFFF` | proof sheet, slips, menus, popovers (working + floating planes) |
| Press desk | `#E3E4EC` | canvas |
| Desk deep | `#D3D5E2` | hover on desk, disabled primary fill, segmented track on desk |
| Chip | `#EDEEF4` / hover `#E1E3EC` | chips, unselected swatches, segmented track on paper |
| Press ink | `#15163A` | text, selected segment, selected chip, history plane |
| Ink soft | `#45476A` | secondary text |
| Ink muted | `#5C5E7C` | meta, placeholders in fields, disabled labels |
| Rule | `#74769A` | control borders (dashed "unavailable" edge, field border) |
| Ultramarine | `#2E33D1` / hover `#2328B0` / press `#1C2090` | the one accent: primary action and focus only |
| Proof yellow | `#FCE3A0` | highlight behind `[placeholders]` the user must fill |
| Danger | `#B42318` | errors (text only) |

### Platform inks (categorical; deliberately not vendor colours)

| Platform | Ink | Text on ink | Ink used as text |
| --- | --- | --- | --- |
| ChatGPT | Magenta `#B81F66` | `#FFFFFF` | `#B81F66` |
| Claude | Viridian `#0A7152` | `#FFFFFF` | `#0A7152` |
| Gemini | Marigold `#F0B323` | Press ink `#15163A` | Deep marigold `#865A00` |

Magenta, marigold and ultramarine are close to process magenta, yellow and cyan, which is the point: the
studio's inks are printing inks.

### Contrast (WCAG 2.x, computed)

| Pair | Ratio |
| --- | --- |
| Press ink on paper / on desk | 17.39 / 13.72 |
| Ink soft on paper / on desk | 8.89 / 7.02 |
| Ink muted on paper / on desk / on chip | 6.27 / 4.95 / 5.42 |
| Rule on paper / on desk (non-text, needs 3) | 4.37 / 3.45 |
| Ultramarine on paper / white on ultramarine | 8.37 / 8.37 |
| White on ultramarine hover / press | 10.49 / 12.66 |
| Ultramarine focus ring on desk | 6.60 |
| White on magenta / on viridian | 6.13 / 6.01 |
| Press ink on marigold | 9.25 |
| Deep marigold text on paper | 6.04 |
| Press ink on proof yellow | 13.77 |
| White on press ink (history plane) / muted `#A7A9C9` on it | 17.39 / 7.59 |
| Rail focus `#9EA2FF` on press ink | 7.51 |
| Composer placeholder `#6E7092` on desk (60 to 92 px display, large text) | 3.77 |

Platform swatches on the dark history plane are 4×(20–30) px colour bars (non-text) at 2.8–9.3; each is
paired with the platform name in text, so colour is never the only signal.

### Dark variant

Not built (not cheap to do well here: the concept depends on white paper). If needed: desk `#1B1C33`,
paper `#F4F5FA` kept light so the proof stays a printed sheet, ink and accents unchanged. That "dark
desk, light proof" variant keeps the metaphor; a fully dark sheet would lose it.

## 3. Typography

Two families with real contrast, both via `next/font/google` in `src/app/design/a/layout.tsx`:

- **Archivo** (variable, `wght` 100–900, `wdth` 62–125), `Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--a-display' })`.
  The display and UI voice. Its width axis gives the specimen look: display is set expanded and heavy.
- **Source Serif 4** (variable, `opsz` 8–60), `Source_Serif_4({ subsets: ['latin'], axes: ['opsz'], style: ['normal','italic'], variable: '--a-serif' })`.
  The proof's voice: prompt text, questions, answers, try-one examples, helper line (italic). Optical
  size is automatic, so 14 px meta and 22 px questions each get the right cut.

| Role | Family | Size / line-height | Weight | wdth | Tracking |
| --- | --- | --- | --- | --- | --- |
| Composer (empty) | Archivo | clamp(44, 6.4cqi, 92) / 0.98 | 780 | 116 | -0.035em |
| Idea title (after) | Archivo | clamp(32, 3.3cqi, 46) / 1.02; 26 mobile | 780 | 114 | -0.03em |
| History title, wordmark | Archivo | 22 / 21 | 780 / 800 | 118 / 125 | -0.02em |
| Questions heading | Archivo | 24; 20 mobile | 720 | 110 | -0.015em |
| Big button | Archivo | 19 / 60 px tall | 650 | 112 | -0.01em |
| Platform name | Archivo | 18 (swatch), 15 (strip) | 700 | 110 | -0.01em |
| UI label, buttons | Archivo | 14.5 | 600 | 104 | 0 |
| Meta | Archivo | 13.5 | 450–600 | 100 | 0 |
| Kbd | Archivo | 12, tabular | 600 | 100 | 0.02em |
| Question | Source Serif 4 | 22 / 1.3; 19 mobile | 500 | n/a | 0 |
| Proof text | Source Serif 4 | 18 / 1.68, max 68ch; 16.5 / 1.64 mobile | 400 | n/a | 0 |
| Try one, answers | Source Serif 4 | 21 / 17 | 400 | n/a | 0 |
| Helper line | Source Serif 4 italic | 17 | 400 | n/a | 0 |

Size contrast is the point: 92 px display against 13.5 px meta on the first screen, and a 46 px title
that stays as the anchor once a prompt exists. No all-caps anywhere, no monospace.

## 4. Planes, depth, edges

| Plane | Surface | Depth |
| --- | --- | --- |
| Canvas | Press desk `#E3E4EC` | none |
| Working | Paper `#FFFFFF`: settings slip, questions slip, proof sheet | Slip: `0 1px 0 #15163a0d, 0 1px 2px #15163a14, 0 8px 20px -8px #15163a29`. Sheet (four layers, ink-tinted): `0 1px 0 …0f, 0 2px 4px -1px …14, 0 14px 28px -8px …24, 0 48px 80px -28px …47` |
| Floating | Paper: menus, popovers | `0 0 0 1px …14, 0 4px 10px -2px …1f, 0 24px 56px -12px …59` |
| Ink | Press ink: history rail, toasts, preview switcher | Rail casts `12px 0 40px -20px #15163a99` onto the desk |

Shadows are tinted with the ink, layered (contact + ambient), and get deeper with elevation. The sheet
also has a 6 px top edge in the platform ink. On copy, the sheet lifts 6 px and its far shadow tints
ultramarine.

**Radii follow size and material:** kbd 4, sheet 3 (paper is crisp), controls 10, big button 12, menus
14, mobile drawer 22, chips and avatar fully round. Not one radius on everything.

**Gradients:** exactly one, functional: the 28 px "wet ink" fade above the roller during generation,
in the platform ink at 16%. The "skipped" progress segment uses a diagonal hatch, which encodes state.

## 5. Layout and navigation

Container queries on `main` (not the viewport) decide the composition, so the same rules work with the
history rail docked or closed.

### Desktop 1440

```
┌ Preview state strip (tool chrome) ─────────────────────────────────────────────────────────────┐
│ [P] PromptHub                       ○ Basic Mode, no AI   History Ctrl\  [+ New prompt]  (MO) │
│                                                                                                │
│  ┌                                          ┐     ┌ paper slip ───────────────┐                │
│   Describe what                                    Write it for                                │
│   you want the AI         (92px Archivo,           [■ ChatGPT  Markdown…   ]                   │
│   to do                    wdth 116, 780)          [■ Claude   XML tags…   ] ← floods viridian │
│   Rough is fine. You can refine it after.          [■ Gemini   Task first… ]                   │
│  └                                          ┘      Length [Concise|Balanced|Detailed]          │
│   Try one                                          [   Generate prompt  Ctrl ↵   ] ultramarine │
│   ■ Write a cold email to my landlord…            └────────────────────────────┘               │
│   ■ Explain a SQL query…   ■ Plan a 3-day trip…                                                │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
 Asymmetric: 1fr composer plate on the desk / 360px settings slip. Left-aligned throughout.

 Result:
│  Write a cold email          ┌ For Claude  Balanced ┐            ‹ Version 3 of 3  Regenerated › │
│  to my landlord about   ┌─────┴──────────────────────┴───────────────────────────────────────┐ ┐ │
│  a broken heater        │ [Improve][Shorten][Expand] [Regenerate] [Tone▾]        [ Copy ⌃⇧C ] │   │
│  Start a new prompt     │ ⓘ Improve, Shorten, Expand and Tone need an AI provider…           │   │
│                         │                                                                    │   │
│  What outcome…          │   You are a tenant who knows their rights…   (Source Serif 18/30)  │   │
│  Repair within 48 hours │   <context>  ← viridian                                            │   │
│  Write it for           │   …[date of call] ← proof-yellow highlight                         │   │
│  [ChatGPT|Claude|Gemini]│                                                                    │   │
│  Length [C|B|D]         │ Built with Basic Mode, no AI   212 words   Regenerated just now    │   │
│  (sticky aside 300–380) └────────────────────────────────────────────────────────────────────┘ ┘ │
```

History: a press-ink rail (320 px) slides in from the left and pushes header and main; `main` re-flows
via its container query. Rows have a 4 px platform-ink bar, title, "Claude, 3 versions", relative time.
The open prompt is a paper-white row on the ink plane: the strongest light/dark contrast in the app.

### Tablet 1024

```
 Empty: composer plate (≈600) + 300px slip, swatch tips hidden.
 Result (rail closed): title (40px) → [platform strip | length] in one row → sheet full width.
 Result (rail docked, main ≈ 700): same single column; refine buttons go icon-only (sheet container
 < 820px), header History label and kbd hints hide.
```

### Mobile 390

```
┌──────────────────────────┐  ┌──────────────────────────┐  ┌──────────────────────────┐
│[P] ○ Basic Mode, no AI ⟲ →│  │[P] ○ Basic Mode, no AI ⟲ →│  │ (page under ink scrim)   │
│┌                        ┐│  │Write a cold email to my  │  │╭────────── ── ─────────╮│
│ Describe what you         │  │landlord about a broken…  │  ││History  [+ New]      ✕││
│ want the AI to do (42px)  │  │[ChatGPT|Claude|Gemini]   │  ││⌕ Search prompts       ││
│ Rough is fine…            │  │[Concise|Balanced|Detail] │  ││[All|ChatGPT|Claude|Ge]││
│└                        ┘│  │ ┌For Claude┐ ‹ Version 3 of 3 › │ Today                ││
│Try one                   │  │┌┴──────────┴───────────┐│  ││▌Cold email to landlord││
│■ Write a cold email…     │  ││You are a tenant who    ││  ││▌SQL query for a new…  ││
│[ChatGPT][Claude][Gemini] │  ││knows their rights…     ││  ││…                       ││
│(swatches as 3 columns)   │  │└────────────────────────┘│  │ 8 prompts on this device │
├──────────────────────────┤  ├──────────────────────────┤  └──────────────────────────┘
│[    Generate prompt     ]│  │[Refine▾][Tone▾][  Copy  ]│     88dvh ink sheet, slides up
└──────────────────────────┘  └──────────────────────────┘
```

Mobile rules: the wordmark hides (the crop-mark P carries the brand) so the engine label can stay in
words. The proof starts above the fold; the Basic Mode note moves into the Refine menu and into a toast
when you tap Tone. Bottom bar uses `env(safe-area-inset-bottom)`; inputs are 16 px+; hit targets 44 px
on coarse pointers.

## 6. Components

**Editor (the proof).** A plain `<textarea>` over a tint layer with identical metrics (Source Serif 18 /
1.68, `pre-wrap`, `overflow-wrap: anywhere`). Tint is colour only: XML tags and Markdown heading text in
the platform's text ink, `#`, `-`, `**` markers in ink muted, `[placeholders]` on proof yellow. Focus is
a 2.5 px ultramarine outline 14 px outside the text block. Older versions are read-only. Footer:
"Built with Basic Mode, no AI", word count, version name and time (16–24 px gaps, no middle dots).

**Platform and length.** On the empty screen the platform picker is a swatch book: three 64 px rows,
each a colour chip, name and one-line tip (the app's existing tooltip copy). The selected row floods
with its ink. After generation it becomes a compact three-segment strip on a paper slip. Both are real
radiogroups with roving tabindex and arrow keys. Length is a segmented control; selected is a press-ink
fill; on the empty screen its description shows below ("Enough context for good results"). Switching
platform re-sets the prompt for that platform immediately (Basic Mode templates are instant).

**Clarification questions.** A paper slip titled "3 questions to sharpen the prompt", with Skip all.
A progress bar of three segments encodes status: ink for answered, hatched for skipped, empty for open
(not numbered; they are not a sequence). Each question is in the serif at 22 px, with a bordered field
and pill chips. Choosing a chip fills the field, shows the chip in press ink with a check, and moves
focus to the next open question. Skipped collapses the field (height + opacity, 220 ms) and shows
"Skipped Undo". Footer: Generate prompt (big primary) and "1 answered, 1 skipped" (`aria-live`).

**Generation moment.** The sheet lands on the desk (opacity, 28 px rise, scale 0.985 → 1, 560 ms
ease-out). Then an **ink roller**, a 4 px bar in the platform ink with a 28 px wet-ink fade above it,
travels down the sheet and the set text is revealed behind it (`clip-path` inset + `translateY`,
compositor-only CSS animation, 2.2 s once; 3.4 s looping in the preview state). The toolbar shows
"Writing with Basic Mode, no AI" with a pulsing ink square (`role=status`) and Stop (Esc). Then the
toolbar swaps to the actions on the same sheet; nothing re-enters.

**Copy moment.** Press: scale 0.97. On resolve, the label crossfades Copy → Copied with a 2 px blur
and 6 px vertical slide (160 ms). At the same time the four crop marks move 8 px inward, thicken to
3 px and turn ultramarine, and the sheet lifts 6 px with an ultramarine-tinted far shadow (260–280 ms
ease-out). A toast says "Copied. Paste it into Claude." (names the platform, gives the next step), and
`aria-live` announces "Prompt copied". After 1.6 s everything settles back. Failure: no label change,
toast "Couldn't copy. Select the text and press Ctrl+C."

**History.** Ink plane: "History" title (Archivo 22, wdth 118), close (`PanelLeftClose`, Ctrl \),
search field (16 px, raised ink), platform filter radiogroup with colour squares, date groups (Today,
Yesterday, Previous 7 days, Earlier), rows with platform bar. Empty search: "No prompts match "x"" plus
"Check the spelling or search a shorter word." and "Clear search and filter". Footer: "8 prompts on
this device".

**Account.** Signed out: "Sign in with Google" (quiet button, icon only on mobile). Signed in: a 36 px
ultramarine avatar with initials; the menu (paper, radius 14, float shadow, scales from the top right)
shows a 44 px avatar, name in Archivo, email in the serif, then "Account settings" and "Sign out".

**Engine.** Hollow ring + "Basic Mode, no AI" in the header; click opens the existing explanation
("No AI provider is set up, so prompts come from local templates. Add ANTHROPIC_API_KEY…").

## 7. Buttons and controls

| Control | Rest | Hover (fine pointer only) | Press | Focus | Disabled / unavailable |
| --- | --- | --- | --- | --- | --- |
| Primary (Generate, Copy) | Ultramarine fill, white, radius 10–12 | `#2328B0`, rise 1 px, ultramarine shadow | `#1C2090`, scale 0.97, shadow off | 2.5 px ultramarine ring, 3 px offset | Desk-deep fill, ink-muted text, no shadow (Generate before any text) |
| Secondary (Regenerate, New prompt, Refine, Stop) | Paper, 1.5 px ink border | Rise 2 px onto a hard 3 px ink offset (a printed shadow) | Back to 0, scale 0.97 | Same ring | n/a |
| Unavailable in Basic Mode (Improve, Shorten, Expand, Tone) | Transparent, **1.5 px dashed** rule border, ink-muted, `cursor: help`, `aria-disabled` + `aria-describedby` to the reason line | none | none | Ring (still focusable so the reason is read) | This is the disabled look: dashed edge vs solid ink edge, never just lower opacity |
| Quiet (header) | Transparent | Desk-deep fill | scale 0.97 | Ring | n/a |
| Chip | Pill, chip fill | Chip-hover, rise 1 px with a 2 px rule underside | scale 0.96 | Ring | n/a; selected = ink fill + check |
| Swatch | Chip fill + colour chip | Chip-hover | scale 0.985 | Ring | n/a; selected = full ink flood |
| Text button | Underline in rule colour, 4 px offset | Underline turns ink | n/a | Ring | n/a |

All hover rules are inside `@media (hover: hover) and (pointer: fine)`.

## 8. Motion spec

Tokens: `--ease-out: cubic-bezier(0.23,1,0.32,1)`, `--ease-in-out: cubic-bezier(0.77,0,0.175,1)`,
`--ease-drawer: cubic-bezier(0.32,0.72,0,1)`.

| Moment | Element (role) | Duration | Easing | Notes |
| --- | --- | --- | --- | --- |
| Button press | any button | 120–140 ms | ease-out | scale 0.97 |
| Hover | buttons, chips, swatches | 160 ms | ease | colour, 1–2 px rise |
| Menus, popovers | account, engine, refine | in 180–200 ms / out 120 ms | ease-out | scale 0.96 → 1 from the trigger corner |
| Questions slip | slip (lead) | 320 ms | ease-out | 16 px rise + fade; fields are already there (one entrance per container) |
| Skip / undo | field + chips | 220 ms | ease-out | height + opacity |
| Sheet landing | sheet (lead) | 560 ms | ease-out | 28 px rise, scale 0.985; rare event, delight budget |
| Ink roller | roller + text clip | 2.2 s once (3.4 s loop in preview) | linear | constant motion = linear; `clip-path` + `transform` only |
| Status ink | 10 px square | 1.2 s alternate | ease-in-out | opacity only |
| Copy label | label (lead) | 160 ms | ease-out | 2 px blur crossfade, `popLayout` |
| Copy crop marks + lift | marks, sheet (support) | 260–280 ms | ease-out | together with the label, no stagger |
| History rail | rail | in 400 ms / out 240 ms | drawer | desktop slides from left; mobile sheet slides up with an ink scrim (300 ms fade) |
| Toast | toast | in 400 ms / out 200 ms | ease-out | 16 px rise |
| Platform switch | tab, top edge, swatch | 220–240 ms | ease | background colour only; text swaps instantly |

Keyboard paths never animate beyond colour (copy via Ctrl ⇧ C still shows the label swap, which is the
confirmation). Reduced motion: no roller (text fades in 400 ms), no rises or slides (opacity only), no
crop-mark travel (they still turn ultramarine), no sheet lift, the status square stops pulsing.

## 9. Keyboard and accessibility

Ctrl/⌘ Enter generates from the composer and the questions; Ctrl/⌘ ⇧ C copies; Ctrl \ toggles history;
Esc closes menus, then stops generation, then closes the mobile sheet. Enter in an answer moves to the
next open question. Radiogroups use arrow keys with roving tabindex. All icon buttons have labels;
streaming status, answer counts, version label and toasts are `aria-live`. Kbd hints hide on coarse
pointers.

## 10. How this fixes the audit

| Audit point | What Direction A does |
| --- | --- |
| 1. No surface hierarchy | Four planes: press desk, paper (slips and the proof), floating menus, and an ink plane for history and toasts. The proof has a four-layer ink-tinted shadow, a platform top edge and crop marks: it is unmistakably "the thing you made". |
| 2. Near-monochrome | Real light/dark masses (blue-black ink on white paper on grey desk, a full ink rail). One ultramarine accent for action and focus, plus three platform inks that appear on swatches, tab, sheet edge, roller, markup and history bars. |
| 3. One voice, little contrast | Archivo expanded and heavy for display and UI against Source Serif 4 for the proof. 92 px composer, 46 px title kept as the anchor after generation, 18 px serif proof, 13.5 px meta. |
| 4. Low affordance | Filled primary, ink-bordered secondary with a printed hover offset, dashed "unavailable" buttons that read as different from secondary, platform choice as a swatch book that floods with colour, chips with fill, hover rise and an ink selected state. |
| 5. No events | Plate with crop marks for the first impression; a paper slip with a three-segment status bar for questions; sheet landing plus ink roller for generation; crop marks closing in, sheet lift and a "Paste it into Claude" toast for copy. |
| 6. No composition | Asymmetric grid: composer plate vs settings slip; sticky title column vs the proof. Index tab and version switcher break the sheet's top edge. |
| 7. No brand | The crop-mark P, the recurring crop marks, the index tab, process-ink colours and the press metaphor throughout. |
| Mobile: prompt is the hero | Title shrinks to 26 px, settings compress to two 40 px rows, the Basic Mode note moves into Refine; the proof starts above the fold and the bar holds Refine, Tone and Copy. |

## 11. Self-review against the frontend-design default tells

| Default tell | Where I started | What I changed |
| --- | --- | --- |
| Cream + serif display + terracotta | First instinct for "editorial" was warm paper and a clay accent | Cool press-grey desk, pure white paper, ultramarine accent; the serif is for the proof text, the display is a grotesk |
| Near-black + one acid accent | n/a | Light-first; the dark plane is a saturated blue-black ink, used for one surface (history) where light/dark contrast does a job |
| Broadsheet hairlines, zero radius, dense columns | Early sketch had ruled columns for the result | Depth instead of rules; radii by material; only two functional hairlines (under the toolbar, above the footer) |
| SaaS card kit | Platform picker was first sketched as three equal cards | Swatch-book rows that flood with colour; one sheet, two slips, each with a different elevation and radius |
| All-caps eyebrows, middle dots, mono labels, "→" | n/a | Sentence-case labels only where they label a control; meta separated by space; no mono; no arrows in buttons |
| Numbered 01/02/03 questions | Considered for "progress" | Replaced by a three-segment status bar (answered, skipped, open), because the questions are not a sequence |
| Scattered fade-up entrances | n/a | One landing per container (sheet, slip); everything else is a response to a user action |
| Single-word accent in headline | n/a | The headline is the user's own idea, set whole |

What I removed in the "mirror" pass: a planned rubber-stamp "Copied" badge (redundant with the crop
marks and label), platform initials inside the swatches (too close to logos), and keyboard hints in the
header when the rail is docked.

Screenshot iterations: round 1 fixed the rail covering the switcher and Copy wrapping to a second toolbar
line when the rail is docked (refine buttons now go icon-only below an 820 px sheet). Round 2 fixed mobile:
the tab and version label wrapping, the proof starting below the fold, "Skip all" wrapping, and the
mobile history sheet staying off-screen after hydration. Round 3 fixed the tablet header clipping the
avatar with the rail docked, gave the tablet empty state two columns, and set proof markup in the platform ink.

## 12. Known weaknesses

- The long idea title is heavy at 1440 (four lines at 46 px). Long ideas (over ~120 characters) would
  need the title to step down a size, as the current app does.
- The roller duration is fixed; it should scale with prompt length (clamp 1.4–2.6 s).
- Platform inks on the ink plane are 2.8–2.9:1 for magenta and viridian (decorative bars, paired with
  text), below 3:1 if judged as UI components.
- The proof's headings cannot be bolder than the body because the tint layer must match the textarea.
- No dark variant built.
- Preview-only simplifications: versions are derived (Generated, Edited, Regenerated), length changes
  re-set the latest version immediately, and "Account settings" shows a toast rather than a page.
