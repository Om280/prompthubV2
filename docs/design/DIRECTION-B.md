# Direction B: Night studio

Preview: `/design/b` (dev only), with `?state=empty|questions|generating|result|copied|history|signed-in`.
Code: `src/app/design/b/**`, `src/components/design/b/**` (styles in `studio.css`, every selector
prefixed `nb-`; see "Implementation notes").

## 1. Concept

A writing room at night. The page is a dark plum room; the prompt is written on one lit sheet; the
platform you are writing for is the lamp. Each platform owns one colour of light, and that light
shows up in exactly the places where the platform matters: the picker, the seam down the sheet's edge,
the primary button, the text caret, the generation moment and the copy moment. Switch from ChatGPT to
Claude and the whole room changes temperature, so the model choice is visible everywhere without a
single label shouting about it.

Signature device: **the seam**. A filament of platform light runs down the left edge of the working
sheet. It is quiet while you think (55% opacity), carries a travelling bead while the prompt is being
written, burns fully once a prompt exists, and the sheet's whole rim takes its colour on copy. The brand
mark is the same object in miniature: a sheet with a lit seam and three lines of text.

## 2. Palette

Dark-first, chromatic, never neutral black. Planes step up in lightness and in violet; the only
saturated colours are the three platform lights.

| Name | Hex | Role |
| --- | --- | --- |
| Night | `#100C1A` | Canvas. Plum, not black. |
| Dusk | `#1A1429` | Radial lift at the top of the canvas (the sky over the desk). |
| Aubergine | `#251D3B` | The sheet: composer, questions, editor. Top 140px graded from `#2A2142`. |
| Heather | `#30274B` | Floating glass (dock, popovers, rail, dialog), at 82–94% with 16–18px backdrop blur. |
| Slate | `#3B315A` | Control fill: secondary buttons, selected segment, chips. |
| Edge | `#4A4068` | Field underline, drag handle. |
| Moonpaper | `#F3EEFA` | Strong text, focus ring. |
| Mist | `#D6CFE6` | Body text, prompt text. |
| Lavender ash | `#ABA2C4` | Secondary text. |
| Dim heather | `#9D94B8` | Meta, timestamps, unavailable labels. |
| Ink | `#1A1326` | Text on lit (hue-filled) buttons. |
| Coral | `#FF9A8F` | Errors and the character cap only. |

Platform lights (our names; none is a vendor brand colour: ChatGPT is not green/black, Claude is not
terracotta, Gemini is not blue-violet):

| Platform | Light | Hex |
| --- | --- | --- |
| ChatGPT | Saffron | `#F4BC55` |
| Claude | Glacier | `#7CC8F7` |
| Gemini | Peony | `#F48DB6` |

Contrast (WCAG 2.x):

| Pair | Ratio |
| --- | --- |
| Moonpaper on Night / Aubergine / Heather / Slate | 16.91 / 13.98 / 12.14 / 10.39 |
| Mist on Aubergine (prompt text) | 10.57 |
| Lavender ash on Aubergine / Heather | 6.60 / 5.73 |
| Dim heather on Night / Aubergine / Heather | 6.76 / 5.59 / 4.85 |
| Ink on Saffron / Glacier / Peony / Moonpaper | 10.45 / 9.84 / 8.01 / 15.81 |
| Saffron / Glacier / Peony on Aubergine | 9.24 / 8.70 / 7.08 |
| Field placeholder `#958CB0` on Aubergine | 5.05 |
| Composer placeholder `#7D7499` on sheet top (44px display, large text) | 3.46 (AA large) |
| Coral on Aubergine | 7.80 |
| Plane steps: Aubergine vs Night, Heather vs Aubergine | 1.21, 1.15 (separation is carried by edge light and shadow, §4) |

Dim heather is never used on Slate (4.15). No light variant in this exploration: the concept is the
lamp in a dark room, and a light variant should be its own study rather than an inversion.

## 3. Typography

Two families with real contrast, both via `next/font/google` in `src/app/design/b/layout.tsx`.

- **Bodoni Moda** (`Bodoni_Moda`, `axes: ["opsz"]`, normal + italic, weight 500–600 used). Display
  only: the composer, the prompt title, the questions (italic), the wordmark, panel titles. Its
  hairlines read like filaments of light on the dark ground; the optical-size axis keeps them from
  breaking up at 22–28px.
- **Schibsted Grotesk** (`Schibsted_Grotesk`, variable 400–900; 400, 500, 600 used). Everything you read
  or operate: prompt text, UI, chips, meta.

Scale (desktop / phone):

| Token | Face | Size / line-height | Use |
| --- | --- | --- | --- |
| Title | Bodoni 500, opsz 72, -0.02em | 46/49 (40 tablet, 32/35 phone) | Prompt title or idea; the anchor that stays once a prompt exists |
| Composer | Bodoni 500, opsz 60, -0.015em | 44/50 (40, 32) | The empty-state idea field |
| Question | Bodoni 500 italic, opsz 28 | 25/31 (22) | Each follow-up question, a voice asking |
| Panel title | Bodoni 500, opsz 28–36 | 24–28 | "History", "Account settings" |
| Wordmark | Bodoni 600, opsz 28 | 23 (21) | PromptHub |
| Prompt | Schibsted 400 | 16/27.2 (15.5/25.6) | Editor text |
| Answer / search input | Schibsted 400 | 16/24 | Never below 16px (iOS zoom) |
| UI | Schibsted 500 | 14–14.5 | Buttons, picker, chips |
| Meta | Schibsted 400–500 | 12.5–13.5 | Timestamps, tips, counts |

Sentence case everywhere; no all-caps labels, no eyebrows, no mono labels. Keyboard hints use the
text face in small filled keycaps.

## 4. Background, surfaces and depth

Three planes, each with a different depth treatment so the hierarchy reads even though dark tones
are close in luminance:

1. **Canvas (Night).** Flat plum with one radial Dusk lift at the top. Behind the sheet sits **the
   lamp**: a 1100×720 radial pool of the current platform light at 20% alpha. Three lamp layers exist
   and crossfade on opacity (600ms ease) when the platform changes. This is the only ambient gradient.
2. **Working sheet (Aubergine).** Radius 24 (20 on phones). Depth = a 1px top light edge
   (`rgb(255 244 255 / .09)` inset), a 1px violet rim (`rgb(178 160 236 / .10)` inset), a tight contact
   shadow (`0 2px 6px -2px`) and a long ambient shadow (`0 28px 64px -28px`, plum-black at .9). The seam
   sits on its left edge.
3. **Floating glass (Heather).** Radius 18 (dock, popovers), 20 (rail), 22 (dialog). Translucent with
   `backdrop-filter: blur(16–18px) saturate(1.2)`, a brighter top edge (.12) and a deeper two-step
   shadow. Glass is reserved for things that float over the work: the dock, menus, the rail, toasts.

Radii follow hierarchy, not one value: sheet 24 > rail 20 > dock/popover 18 > buttons 12 > segment
items 9–12 > chips and filters (pills, 999) > keycaps 6.

Gradients, exhaustively, and why:

| Where | What | Why |
| --- | --- | --- |
| Canvas top | Dusk radial | Gives the room a ceiling so the sheet sits in space, not on a flat fill |
| Lamp | Platform light radial, 20% | Makes the model choice ambient |
| Seam | Platform light, transparent at both ends | The signature; reads as a filament, not a border |
| Sheet top 140px | `#2A2142` to Aubergine | The sheet is lit from above, so the title edge is brightest |
| Ghost bars (generating) | Platform light 22% to violet 8% | Shows the prompt's structure "warming up" |
| Copy sweep | Platform light band | The copy moment |
| Avatar | Two-step violet | A small object with volume |

No decorative gradient washes, glows on cards or gradient text.

## 5. Navigation and history

Header (64px, sticky, Night at 92–70% with blur): mark + wordmark, "History" toggle (ghost button with
icon), spacer, engine pill, "New prompt", then account. Signed out shows "Sign in with Google" (text
only, no vendor logo); signed in shows a 36px initials avatar.

History, ≥900px: a floating glass panel (320px; 288px at tablet) docked left under the header, inset
16px from the canvas edges, so it reads as a panel over the room rather than a column of the page.

- Title "History" in Bodoni 24, close icon button "Hide history".
- Search: filled field with a search icon, "Search prompts", filters as you type; focus ring is the
  platform light.
- Platform filter: four pills in a grid (All, ChatGPT, Claude, Gemini), each platform pill with its
  light dot.
- Groups Today, Yesterday, Previous 7 days, Earlier (meta size, Dim heather, sentence case).
- Rows 40px: platform dot, title (ellipsis), time. The open prompt has a Heather fill and a 3px lit
  bar in its platform's light at the left edge. Arrow keys move between rows.
- Footer "Recently deleted" with count; swaps to the deleted view ("Nothing deleted in the last 30
  days.", "Back to history").
- Empty search: `No prompts match "{query}".` with "Clear search".

Below 900px: a bottom sheet (86dvh, radius 24 top, drag handle). The handle tracks the finger 1:1,
dismisses past 30% of the height or on a flick over 400px/s, otherwise springs back; the list keeps
native scrolling. "Done" closes; choosing a prompt closes it.

## 6. Editor

The sheet holds the prompt. A meta bar sits across its top: version switcher on the left
("‹ Version 3 of 3 ›" plus a pill "Edited, 2 min ago"), and on the right the platform dot with
"For ChatGPT" and the word count. The prompt is an editable textarea in Schibsted 16/1.7 on Mist, padded
44px, caret in the platform light. Under the sheet: "Built with Basic Mode, no AI. Same idea and
settings give the same prompt."

Version or platform change: the text settles in (opacity .4 to 1, blur 2px to 0, 220ms ease-out).
Hand edits in the version trail survive a platform or length change, because they are appended lines.

The dock floats over the bottom edge of the sheet (sticky, 20px from the viewport bottom) as one glass
bar: Improve, Shorten, Expand, Tone (unavailable in Basic Mode) | Regenerate (secondary) | Copy (lit).

## 7. Platform and length

"For" + a sunken track (`rgb(10 8 18 / .55)` with an inner shadow) holding three options, each with
its light dot. The selected option is a raised pill tinted with its own light (16% into Heather), a
55% light rim and a soft glow; the dot gets a halo. The pill slides between options (spring 0.34s,
bounce 0.12; instant under reduced motion). Arrow keys, Home and End move the selection (radiogroup
with roving tabindex). Under the row, the platform tip from the app: "Uses XML tags and clear sections,
the way Claude reads best."

Length is a second, quieter segmented control (Concise, Balanced, Detailed) with a Slate selected
fill: no colour, because length is not a platform decision. On phones both become full-width rows.

Changing the platform re-renders the prompt with that platform's template (`renderPrompt`) and
re-tints the lamp, seam, button, caret, chips and selection colour.

## 8. Clarification questions

The questions live on the sheet, as a short guided conversation:

- Head: "3 questions to sharpen the prompt", a three-step progress strip (the questions really are a
  sequence), and "Skip all". Steps: open (faint), answered (lit in the platform light), skipped
  (dotted).
- Each question in Bodoni italic 25px, a voice asking. Its answer field is an underline input (16px,
  "Type an answer or pick one") whose line turns into the platform light on focus.
- Suggestion chips are filled pills with a light top edge; hover lifts 1px; the chosen chip fills with
  the platform tint, gains a light rim and a check.
- Status on the right: "Skip" (secondary button), then "Answered" with a lit check plus "Clear", or
  "Skipped" plus "Undo". Skipping collapses the field and chips (height 200ms ease-in-out, opacity
  120ms) and dims the question.
- Footer: lit "Generate prompt" with its shortcut, and "1 answered, 1 skipped" (live region).

Keyboard: Enter moves to the next open question (or to Generate), Esc clears then skips.

## 9. Generation moment

Basic Mode returns instantly, so this moment is presentation, never a claim of work. It runs 1.15s
and is skipped entirely under reduced motion.

1. The meta bar reads "Writing with Basic Mode, no AI" with a lit dot (live region).
2. The seam carries a white bead travelling down it (1.1s, linear, loops only while writing).
3. The prompt's whole shape appears first as **bars of light**: one rounded bar per line, sized to the
   line, in a platform-light gradient. You see the structure (sections, lists) before the words.
4. Line by line, top to bottom, each bar is replaced by its text: opacity 0 to 1, blur 6px to 0, 3px
   rise (420ms, ease-out `cubic-bezier(0.23, 1, 0.32, 1)`), with a light flare that sweeps out along
   the line (scaleX .3 to 1, opacity 1 to 0, 700ms). Step = 1.15s / number of lines.
5. The view hands over to the editable result.

The `generating` preview state loops the reveal (3.6s with a 1.2s hold) so it can be reviewed.

## 10. Copy moment

Copy is the user's goal, so it gets the loudest moment:

- The button label crossfades "Copy" to "Copied" with a 2px blur bridge (160ms; instant under reduced
  motion). The button keeps its width.
- The sheet's whole rim takes the platform light (inner rim + outer halo), in 160ms, and lets it go
  over 700ms when the button reverts (2s).
- A band of platform light crosses the sheet left to right once (750ms, ease-in-out; skipped under
  reduced motion).
- Toast "Prompt copied" with a lit check, bottom centre, in a live region.
- Shortcut Ctrl/⌘ Shift C does the same.

## 11. Buttons and controls

| Kind | Rest | Hover (fine pointers only) | Press | Focus | Disabled / unavailable |
| --- | --- | --- | --- | --- | --- |
| Primary (Generate, Copy) | Platform light fill, Ink text 600, inner top highlight, glow pseudo at 35% | Lift 1px, glow to 80% (opacity only) | scale .97, 140ms | 2px Moonpaper ring, 3px offset | Heather fill, Dim text, no glow ("Generate prompt" with an empty idea) |
| Secondary (Regenerate, Skip, Sign in) | Slate fill, Moonpaper text, light edge | `#463B69` fill | scale .97 | Ring | n/a |
| Ghost (History, New prompt, Undo) | Transparent, Mist | Violet 10% fill, Moonpaper | scale .97 | Ring | 40% opacity (version arrows at the ends) |
| Unavailable (Improve, Shorten, Expand, Tone in Basic Mode) | Transparent, **dashed** violet outline, Dim text | Tooltip with the reason | Shows the reason as a toast; never runs | Ring; the reason appears as tooltip | This is the disabled look: dashed and unfilled, never confused with secondary |
| Chip | Filled pill, light edge | Lift 1px, lighter fill | scale .97 | Ring | n/a |
| Picker option | Ash text | Moonpaper text | n/a | Ring (1px offset) | n/a |

Reason copy (unchanged from the app): "Improve, Shorten, Expand and Tone need an AI provider. Add an
API key to the server to turn them on." Every hover style is inside
`@media (hover: hover) and (pointer: fine)`.

## 12. Micro-interaction spec

Easings: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`,
`--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`. Only transform, opacity and filter animate (plus
height for the question collapse). Exits are faster than entries.

| Trigger | What moves | Duration | Easing | Reduced motion |
| --- | --- | --- | --- | --- |
| First load (empty) | Sheet: opacity, y 8 to 0; "Try one" follows 80ms later | 420ms | ease-out | Opacity only |
| Any press | scale .97 | 140ms | ease-out | None |
| Primary hover | y -1px, glow opacity | 140 / 200ms | ease-out / ease | Glow only |
| Platform change | Picker pill slides; lamp crossfade; text settles | spring .34s b.12; 600ms; 220ms | spring; ease; ease-out | Instant pill; 200ms lamp; opacity only |
| Questions arrive | Each block: opacity, y 8 to 0; stagger 0, 45, 80ms | 260ms | ease-out | Opacity, no stagger |
| Skip question | Field and chips collapse | 200ms (opacity 120ms) | ease-in-out | Instant |
| Generate | Ghost bars fade in, lines resolve, flares | 1.15s total, 420ms per line | ease-out | Text appears at once |
| Writing | Seam bead | 1.1s loop while writing | linear | Static |
| Copy | Label swap; rim light; sweep | 160ms; 160ms in / 700ms out; 750ms | ease-in-out; ease-out; ease-in-out | Instant swap; rim fade; no sweep |
| Popover / menu | opacity, scale .97 to 1 from the trigger corner | 160ms in, 110ms out | ease-out | Opacity only |
| Tooltip | opacity, y 4px, scale .97 | 125ms | ease-out | Opacity |
| Rail (button) | x -16 to 0, opacity | 240ms in, 180ms out | ease-drawer | Opacity |
| Mobile sheet | y 100% to 0; follows the finger 1:1 | 360ms in, 260ms out | ease-drawer; spring back | Opacity |
| Toast | y 16 to 0, opacity | 400ms in, 250ms out | ease | Opacity |
| Keyboard shortcuts | Nothing extra animates for keyboard-only toggles | 0 | n/a | n/a |

## 13. Composition

Desktop 1440. One 820px column, centred in the room; the lamp pools behind the sheet.

```
┌ Night ──────────────────────────────────────────────────────────────────────────┐
│ [▮≡] PromptHub   (History)                ( ○ Basic Mode, no AI ) (+ New prompt) [MO] │
│                                                                                  │
│            Cold email to landlord                       (Bodoni 46)              │
│            Write a cold email to my landlord about…    (ash)                     │
│            For [● ChatGPT][● Claude][● Gemini]  [Concise|Balanced|Detailed]      │
│            Uses Markdown sections and a role line.                               │
│          ┃┌──────────────────────────────────────────────────────┐               │
│   seam → ┃│ ‹ Version 3 of 3 › (Edited, 2 min ago)  ● For ChatGPT 196 words │     │
│          ┃│                                                      │  ← lamp pool  │
│          ┃│ Act as a tenant who knows their rights…              │               │
│          ┃│ ## Context …                                          │               │
│          ┃│  ┌ dock (glass) ──────────────────────────────────┐  │               │
│          ┃└──┤ Improve Shorten Expand Tone │ Regenerate [Copy] ├──┘               │
│              └────────────────────────────────────────────────┘                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Empty state: the sheet sits at ~9vh from the header and is the hero: the idea field in Bodoni 44
("Describe what you want the AI to do"), the platform and length controls inside the sheet's foot, then
"Rough is fine. You can refine it after." and the Generate button. "Try one" examples sit under it as
pills.

Tablet 1024. Same column; with history open the glass rail takes 288px at left and the column narrows.
The dock adapts to its column through a container query (keyboard hints drop, padding tightens) rather
than to the viewport.

Phone 390. The prompt is the hero; actions are reachable but smaller than it.

```
┌──────────────────────────────┐
│ [▮≡] PromptHub   (○) + ⟲ ⇥   │  engine dot, new, history, sign in / avatar
│ Cold email to landlord       │  Bodoni 32
│ Write a cold email to my…    │
│ [ ● ChatGPT | Claude | Gemini ]│  full width
│ [ Concise | Balanced | Detailed]│
│ ┃┌──────────────────────────┐ │
│ ┃│ ‹ Version 3 of 3 › Edited │ │
│ ┃│ Act as a tenant who…      │ │
│ ┃│ …                         │ │
│ ┌──────────────────────────┐  │
│ │ Refine  (⟳)  [   Copy   ]│  │  floating glass dock, safe-area aware
└──────────────────────────────┘
```

"Refine" opens a small glass panel above the dock with the Basic Mode reason and the four unavailable
actions. History is the bottom sheet. Questions stack: question, then status, then field and chips
(40px tall), and a full-width Generate.

## 14. How this fixes the audit

| Audit point | Fix in Direction B |
| --- | --- |
| 1. One plane, editor looks like the page | Three planes with different depth models: plum canvas, a lit Aubergine sheet with edge light and two-step shadow, and Heather glass for anything floating. The prompt is the only thing on the sheet. |
| 2. Near-monochrome colour | A chromatic plum ramp with clear light/dark masses (Moonpaper on Night is 16.9:1) plus three platform lights that recur in picker, seam, lamp, caret, button, chips, history dots and copy. |
| 3. One voice, weak type contrast | Bodoni Moda against Schibsted Grotesk. The title stays at 46px once a prompt exists, so the page keeps its anchor. Questions are italic display, a different voice from the UI. |
| 4. Low-affordance controls | Filled primary with glow and lift, Slate secondary, filled chips, a sunken platform track with a lit raised pill. Unavailable actions are dashed and unfilled, unmistakably different from secondary. |
| 5. No moments | Idea: the seam and Generate light up as you type. Questions: guided conversation with progress. Generating: bars of light resolve into text. Copy: rim light, sweep, morphing button, toast. |
| 6. No composition | Centred sheet in a lit pool with a floating dock straddling its edge; glass rail floats in the room; display title above a quieter settings band. |
| 7. No brand | The seam is the signature and the mark is the seam in miniature; the platform lights are the colour identity. |
| Mobile: bottom bar dominates | The dock is a compact glass bar (Refine, Regenerate icon, Copy); the prompt fills the screen above it. |

## 15. Self-review against the frontend-design defaults

| Default tell | Status | What I revised |
| --- | --- | --- |
| Near-black with one acid accent | Avoided | First pass used `#140F1F`/`#211A33`; the sheet sat 1.13:1 against the canvas, the audit's own complaint. Deepened Night to `#100C1A`, lifted the sheet to `#251D3B` and moved the separation into edge light and shadow. The accent is three meaning-bearing lights, not one acid colour. |
| Cream + serif + terracotta | Avoided | A serif display on a dark plum ground; no warm neutrals. Rejected Fraunces and Instrument Serif as the over-used picks; Bodoni's hairlines suit "light on a dark ground". |
| SaaS card kit, one radius everywhere | Avoided | One sheet, not a card grid; radii step with hierarchy (24/20/18/12/pill). Shadows are plum-black and paired with edge light, not grey `rgba(0,0,0,.1)`. |
| Gradient washes as decoration | Controlled | Every gradient is listed in §4 with its reason. The lamp went from 13% to 20% after the first screenshots, because at 13% it read as a muddy patch rather than a light source; it is still the only ambient gradient. |
| All-caps eyebrows, mono labels, middle-dot meta, "→" in buttons | Avoided | Meta items are separate spans with gaps, never joined with dots. Keycaps use the text face. |
| Numbered markers | Used once, on purpose | The progress strip counts questions because they are a real sequence; no 01/02/03 anywhere else. |
| Accenting one word in a headline | Avoided | Considered colouring the platform names in an intro line on the empty state; cut it as a tell. |
| Scattered entrance motion | Controlled | One load entrance (sheet, then examples). Everything else answers an action. The generation reveal is the one delight budget, and it is skipped with reduced motion. |
| Vendor brand colours | Avoided | ChatGPT is Saffron (not green), Claude is Glacier (not terracotta), Gemini is Peony (not blue-violet). |

Revisions after screenshot critique (two rounds): the seam at rest went from 35% to 55% so the
signature reads on first impression; the dock now fits its column with a container query (it overflowed
beside the rail at 1024); the platform filter became a four-column grid ("Gemini" wrapped); on phones
"Skip all" shares the intro row and the sheet meta drops the duplicate "For ChatGPT"; the copy label is
centred so the button never shifts; field placeholders were raised from 4.37:1 to 5.05:1.

Chanel pass, things left out on purpose: a Stop button while generating (Basic Mode is instant, so it
would imply work that is not happening), hover lift and stagger on history rows (used tens of times a
day), and a visible intro line with platform-coloured names on the empty state.

## 16. Implementation notes and known gaps

- The project's Turbopack rule compiles every `*.css` as plain CSS through the Tailwind loader, so CSS
  modules are not hashed. Styles therefore live in `src/components/design/b/studio.css` with every
  selector prefixed `nb-`, and `styles.ts` maps `s.header` to `"nb-header"`. Lightning CSS collapses
  hand-written `-webkit-backdrop-filter` pairs, so only the unprefixed property is written.
- Prompt text is real: `renderPrompt` with the mock briefs; answered questions are folded into the
  brief's context. Hand edits in the version trail are appended lines.
- Known gaps: the version label isn't a popover list (only previous/next); history rows have no
  rename/delete menu; the Tone menu is shown only in its unavailable Basic Mode form; ghost bars are
  sized from source line length, so a long wrapped paragraph shows as one bar; the plane steps rely on
  shadow and edge light, which are weaker on low-quality displays.
