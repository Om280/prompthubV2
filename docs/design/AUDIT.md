# Design audit: why "Spruce and brass" reads as bland

Lead audit, 2026-11-23. Based on the source (`src/app/globals.css`, `src/components/**`), `docs/DESIGN.md`
and production screenshots of every major state at 1440 and 390 wide (empty, questions, ready
ChatGPT/Claude, copied, Basic Mode popover, history, mobile sheet).

The direction did what it set out to do: restraint, no cards, one accent. The user's verdict is that
restraint became absence. These are the specific causes.

## 1. There is no surface hierarchy; everything sits on one plane
- The page, composer, questions, editor and toolbar all share `--color-bg #121816`. The only other
  surface (`#182120`) is the rail, and it is 1.1:1 against the page.
- The editor, which is the product's output, is visually identical to the page around it. Nothing says
  "this is the thing you made".
- There is no elevation at all at rest (DESIGN §4 bans resting shadows), so nothing reads as
  foreground or background.

## 2. Colour is almost monochrome
- The palette is a single desaturated green-grey ramp plus brass. Brass appears in exactly two places
  per screen: the filled button and the platform underline.
- With dark text-on-dark and muted greys at 5–8:1, the whole screen collapses to one mid-value. There
  are no light/dark masses for the eye to organise around.
- The functional colours (tag blue, success, danger) are so restrained that the anatomy tint reads as
  noise rather than a feature.

## 3. Typography has one voice and little contrast
- One family (Mona Sans). Width-axis hierarchy is invisible to most people: 112 vs 100 vs 96 wdth
  differences read as "the same font".
- Sizes cluster between 12.5 and 22px once a prompt exists. The 40px headline only exists in the empty
  state, then drops to 22px and the page loses its anchor.
- Labels, meta and buttons are all 12.5–14px grey, so the controls never assert themselves.

## 4. Controls have low affordance
- Toolbar actions are icon plus grey text with no container. Disabled (Basic Mode) and enabled states
  differ only by opacity, so the toolbar reads as disabled even when it isn't.
- The platform picker is three grey words. Choosing ChatGPT, Claude or Gemini, a core decision, has the
  visual weight of a breadcrumb.
- Chips are thin outlines with no fill, hover depth or selected state beyond a brass border.
- The Generate button at rest is dimmed brass on dark green: the primary action looks inactive.

## 5. The key moments have no event
- **First impression:** a dark empty page with a grey placeholder, about 60% dead space and no brand
  mark beyond a text wordmark.
- **Questions:** plain text blocks, no sense of a short guided conversation, no progress.
- **Generation:** Basic Mode returns instantly and the editor just appears. There is no "here is your
  prompt" moment.
- **Copy:** a label swap and a faint wash. Copying is the user's goal, and it barely registers.

## 6. Layout lacks composition
- One 720px column with everything left-aligned and evenly spaced gives no focal tension.
- The header is a thin strip of grey links, and the rail is a list of grey text.
- On mobile the bottom bar is the strongest element on screen, more prominent than the prompt itself.

## 7. No brand identity
There is no logo mark, no signature shape, no signature colour moment and no illustration or texture.
Take the wordmark away and it could be any dark-mode note app.

## What a redesign must change, whatever the direction
1. **Surfaces:** at least three distinct planes (canvas, working surface, raised/floating), with real
   contrast and a deliberate depth model (shadow, light edge or tone).
2. **Colour:** a palette with a genuine light/dark structure and an expressive accent system, including
   colour for each target platform so the model choice is visible everywhere.
3. **Type:** two families with real contrast (display and text), and a scale that keeps a strong anchor
   once a prompt exists.
4. **Controls:** buttons and pickers with fills, borders, hover lift and press states that read at a
   glance. Disabled must look clearly different from secondary.
5. **Moments:** designed transitions for idea → questions → generating → result → copied.
6. **Signature:** a brand mark and one recognisable visual device that recurs.
7. **Mobile:** the prompt stays the hero; actions are reachable but don't dominate.

Constraints carried over:
- Accessibility AA.
- Reduced motion respected.
- Every control works; no fake AI.
- Basic Mode is clearly labelled.
- Platform names only, never vendor logos.
- Function, routes, tests and microcopy logic don't change.
