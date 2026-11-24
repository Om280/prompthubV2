# Model-specific prompting: research and PromptHub strategy

Researched 2026-11-23 against primary vendor documentation only. Each claim is tagged with its source:
**[OAI]**, **[OAI-R]**, **[OAI-L]**, **[ANT]**, **[GEM]** (list at the end). Anything a vendor does not
document is marked *not documented*. PromptHub does not treat undocumented claims as differences.

> Scope: PromptHub writes prompts that people **paste into consumer chat products** (ChatGPT, Claude,
> Gemini apps). These have no system or developer message field and no sampling parameters. So every
> API-only lever below (developer messages, `instructions`, system prompts, prefill, temperature,
> reasoning effort, structured outputs) is recorded for completeness and for a future "API export"
> feature, but **is not emitted into prompts**.

## 1. What all three vendors agree on

These principles apply to every target and live in the shared core of the optimizer.

| Principle | OpenAI | Anthropic | Google |
| --- | --- | --- | --- |
| Clear, specific instructions; say exactly what output you want | GPT models "benefit from precise instructions" [OAI] | "Be clear and direct… Be specific about the output format and constraints" [ANT] | "Give clear, specific instructions" [GEM] |
| State the output format explicitly | Yes [OAI] | Yes [ANT] | "Specify the format you want (table, bulleted list…)" [GEM] |
| Separate instructions from material with delimiters | Markdown headers for sections, XML tags for content boundaries [OAI]; delimiters [OAI-R] | XML tags [ANT] | "XML tags… or Markdown headings"; "Pick one format and use it consistently" [GEM] |
| Supply the context; don't assume the model has it | RAG and explicit data [OAI] | Add context and motivation [ANT] | "Supply the information the model needs" [GEM] |
| Constraints stated explicitly | Explicit limits, e.g. budget ceilings [OAI-R] | Constraints [ANT] | "State what the model should and shouldn't do" [GEM] |
| Examples steer format and style | Few-shot, diverse [OAI] | 3–5 relevant, diverse examples [ANT] | Few-shot, consistent structure [GEM] |
| Don't ask for visible step-by-step reasoning by default | Avoid CoT prompts for reasoning models [OAI-R] | Thinking is a model or API feature, not prompt text [ANT] | "Don't ask the model to outline its reasoning in the output" [GEM] |
| Avoid over-emphatic or persuasive language | *not documented* in the pages read | Over-prompting ("If in doubt, use…") causes overtriggering on current models [ANT] | "Avoid unnecessary or overly persuasive language" [GEM] |

## 2. Instruction and context handling

**Role and persona.**
- [OAI] An "Identity" section (purpose, style, goals) comes first in a developer message.
- [ANT] "Setting a role in the system prompt focuses Claude's behavior… Even a single sentence makes a difference."
- [GEM] "Define a role in the system instruction," or put persona, constraints and format "at the start of the prompt."

*Consumer translation:* there's no system field, so the role is one opening sentence of the user prompt,
and only when it changes the answer (expert review, a specific voice). PromptHub skips generic
"You are a helpful assistant" roles.

**Motivation.** [ANT] explicitly recommends explaining *why* an instruction matters ("Claude can
generalize from the explanation"). OpenAI and Google don't make this a stated technique. The Claude
profile adds short reasons to non-obvious constraints. The others include a reason only when the user
gave one.

**Positive framing.** [ANT] says "Tell Claude what to do instead of what not to do." [GEM] says to state
both should and shouldn't. [OAI] examples use both. PromptHub prefers positive phrasing for all targets,
which costs nothing, and *requires* it for Claude.

**Ambiguity and assumptions.**
- [OAI-L] For the latest GPT model: "Make reasonable, reversible assumptions and state them." Stop to
  clarify only for significant scope changes, blockers or user-level decisions.
- [GEM] "Define parameters. Explain ambiguous terms."
- [ANT] Treat Claude like "a brilliant but new employee who lacks context."

PromptHub applies this as follows. ChatGPT prompts may include "If something is unclear, state your
assumption and continue." Gemini prompts define ambiguous terms inline. Claude prompts give the missing
context up front.

**Scope and initiative.** [ANT]: "If you want Claude to do more than the task strictly requires,
explicitly request it." So the Claude profile spells out every wanted element, and adds a "go beyond the
basics" modifier only at Detailed length when the user's intent is open-ended. [OAI-L]: the latest model
biases "towards action and persist until you've completed the task." The ChatGPT profile doesn't add
persistence boilerplate to single-turn chat prompts; that advice is aimed at agentic API use.

## 3. Structuring techniques

| | ChatGPT (OpenAI) | Claude (Anthropic) | Gemini (Google) |
| --- | --- | --- | --- |
| Documented preference | Markdown headers and lists for sections; XML for content boundaries [OAI] | XML tags for instructions, context, examples and inputs; consistent, descriptive names; nest for hierarchy [ANT] | XML or Markdown, but **one style, consistently** [GEM] |
| Suggested order | Identity → Instructions → Examples → Context; context "usually best positioned near the end" [OAI] | Long data at top, query and instructions at end [ANT] | Critical instructions (persona, constraints, format) first; for long context, material first, question last [GEM] |
| PromptHub choice | Markdown `##` sections; user material in a fenced or tagged block at the end | Plain lead sentence + XML-tagged blocks (`<context>`, `<requirements>`, `<output_format>`, `<material>`) | Markdown sections with task and constraints first; long material, then a closing "Based on the material above, …" line |

Note that XML is **not** exclusive to Claude: OpenAI and Google both document it. PromptHub uses XML for
Claude because Anthropic recommends it most specifically and for the widest range of content, not
because other models can't read it. The Markdown choice for ChatGPT and Gemini is a reasonable default,
not a vendor requirement.

## 4. Examples (few-shot)

| Vendor | Position |
| --- | --- |
| [GEM] | "We recommend to always include few-shot examples in your prompts." Warns too many → overfitting; keep identical structure. |
| [ANT] | "One of the most reliable ways to steer… format, tone, and structure." 3–5 examples, wrapped in `<example>` / `<examples>`. |
| [OAI] | Few-shot in the developer message, diverse inputs. |
| [OAI-R] | Reasoning models: "Try zero-shot first." Examples that mismatch instructions hurt. |

**PromptHub policy:** never invent examples. Fabricated examples would add requirements the user didn't
state, which conflicts with preserving intent. Instead:
- If the user provides a sample (in the idea or an answer), it is included in the target's example
  syntax: `<example>` for Claude, an "Example" section for ChatGPT and Gemini.
- For **Gemini**, whose vendor recommends examples most strongly, the clarify step gives higher priority
  to a question like "Do you have an example of the output you want?" when format or style matters.
- ChatGPT prompts stay zero-shot unless the user supplied an example, in line with [OAI-R].

## 5. Output formats and length

- All three: state the format. [GEM] suggests response prefixes. [ANT] prefill is **no longer supported**
  on current Claude models (400 error); it doesn't apply to consumer chat anyway.
- **Verbosity defaults differ, per each vendor's own docs:**
  - [GEM] "Gemini 3 is concise by default, so ask for detail if you need it."
  - [OAI-L] Latest GPT "tends to be more concise and direct by default". Revisit blanket "be concise"
    instructions.
  - [ANT] Latest Claude models are "less verbose," with Opus 5 as a documented exception that runs longer.
- **Consequence:** length settings map to *explicit, concrete targets* for every destination
  ("about 150 words", "3–5 bullet points", "a one-page plan"). They don't map to adjectives. At
  Concise, PromptHub doesn't stack redundant "be concise / be brief" phrases. At Detailed, it names what
  the extra detail should contain, which matters most for Gemini.
- **Format steering for Claude:** [ANT] notes that prompt style influences output style ("removing
  markdown from your prompt can reduce the volume of markdown in the output"). When the user wants
  prose, the Claude prompt describes the prose explicitly ("write in flowing paragraphs") and avoids
  bullet-heavy prompt structure.
- **LaTeX:** [ANT] says current Claude models default to LaTeX for math. When the user wants plain
  text, the Claude profile adds the plain-text math instruction.

## 6. Long-context handling

| | Guidance |
| --- | --- |
| [ANT] | 20k+ tokens: "Put long-form data at the top… above your query"; "Queries at the end can improve response quality by up to 30 percent in tests." Wrap documents in `<document>` with `<source>` and `<document_content>`. |
| [GEM] | "Supply all the material first, put your question at the very end," with a transition like "Based on the information above." |
| [OAI] | Context near the end of the developer message. For caching, put reusable instructions first and the variable input last. |

**PromptHub rule:** when the user includes long material (more than about 1,500 characters pasted in the
idea or answers):
- **Claude:** material first (in `<material>` or `<documents>`), then details, then the task last in
  `<task>`.
- **Gemini:** a short task line plus the critical constraints and format first (Google: "prioritize
  critical instructions"), then the material, then the question restated at the very end with "Based on
  the material above, …" and a grounding line.
- **ChatGPT:** instructions first, material last (OpenAI: context "near the end"), then one short closing
  line that restates the task.

Anthropic and OpenAI give opposite orders here, so this *is* a real, documented difference. Gemini's
order follows from combining two of Google's own rules.

## 7. Model-specific considerations (documented only)

**ChatGPT / OpenAI**
- GPT vs. reasoning models behave differently: precise steps vs. high-level goals [OAI]. A consumer
  doesn't always know which mode is active. PromptHub writes goal-first prompts with explicit success
  criteria, then concrete constraints, which suits both.
- Avoid "think step by step" [OAI-R].
- "Final answers must be self-contained" [OAI-L], so the prompt asks for a standalone deliverable when
  the output will be reused.
- The latest model already defaults to concise; don't add blanket "be concise" [OAI-L].

**Claude / Anthropic**
- Be explicit about everything wanted, because current models follow instructions literally and won't
  infer "more" [ANT].
- Add the reason for non-obvious constraints [ANT].
- XML-tagged sections; examples in `<example>` tags [ANT].
- Positive format instructions; match prompt style to the desired output style [ANT].
- Remove over-prompting and aggressive emphasis; current models overtrigger on it [ANT].

**Gemini / Google**
- Be direct and precise; avoid persuasive language [GEM].
- Define ambiguous terms [GEM].
- Ask for detail explicitly; it defaults to concise [GEM].
- Put critical instructions first; for long context, put the question last [GEM].
- Few-shot is strongly recommended [GEM].
- For time-sensitive tasks, state the current date (documented for Gemini 3 Flash) [GEM]. PromptHub adds
  "Today is <date>." to Gemini research and planning prompts when the task depends on recency.
- Grounding clause: tell it to answer only from the provided material and say when something isn't
  there (documented for Gemini 3 Flash) [GEM]. Google documents it for grounded agent setups, not as
  a rule for every prompt. PromptHub therefore applies it **only when the user asks to stay within the
  material** (§6a).

## 6a. Source grounding depends on the task (revised 2026-11-23)

The first draft gave every Gemini prompt with material an "use only the material" line. That was
overgeneralized: it would stop a research prompt from using the model's own knowledge, and stop a
brainstorm from exploring. The rule now lives in `shared.sourcePolicy()` and applies to **all three
targets** with the same wording, because no vendor documents a target-specific difference here:

| Situation | Policy | Line emitted |
| --- | --- | --- |
| No material supplied | none | nothing |
| User asked to stay within the material | `material-only` | "Use only the material provided. If something isn't covered there, say so." |
| Source-based analysis (default) | `material-first` | "Base your answer on the material provided. If you add anything from outside it, say which points those are." |
| Research with material | `material-plus` | "Use the material provided together with your own knowledge and any research you can do. Make clear which points come from the material." |
| Brainstorming, creative writing | `open` | "Treat the material as a starting point. You're free to go beyond it." |
| Coding, planning, productivity, general | none | nothing (the user's own constraints carry any limits) |

A review of the other profiles for similar overgeneralization found two cases in ChatGPT: the "state your
assumption and continue" line and the "Done when" success criterion. Both come from guidance aimed at
deliverables and agentic work, and they would narrow creative writing and brainstorming, so they are
now emitted only for deliverable tasks. Claude's "Go beyond the basics" at Detailed length already
names category-specific extras and was kept. Gemini's date line was already conditional on
recency-sensitive tasks. The evaluator now fails any prompt whose source line doesn't match its task
(`tests/unit/prompting/grounding.test.ts`).

## 8. Techniques that must not be applied blindly

| Technique | Why not universal |
| --- | --- |
| "Think step by step" / "explain your reasoning" | Discouraged by OpenAI for reasoning models and by Google for Gemini 3; Claude handles thinking as a model feature. Never emitted by default. Included only when the user wants visible reasoning (e.g. a teaching explanation), phrased as an output requirement. |
| Invented few-shot examples | Adds requirements the user didn't give; Google warns of overfitting; OpenAI warns mismatched examples hurt. |
| ALL CAPS / "CRITICAL" / "You MUST" | Anthropic documents overtriggering from over-prompting; Google says avoid persuasive language. Never emitted. |
| Blanket "be concise" | Redundant on the latest GPT and Gemini defaults; replaced by concrete length targets. |
| Persona boilerplate ("You are a world-class…") | Vendors document roles as *useful when specific*. Generic praise roles add nothing. Emitted only when a specific expertise or voice changes the result. |
| Prefill / response prefixes | Claude no longer supports prefill; consumer chat can't prefill. Gemini's prefix technique is only usable as a trailing "Begin with:" line, so it isn't emitted by default. |
| System or developer wrappers, sampling params, reasoning effort | API-only; never emitted. Candidates for a future API export. |
| Mixing XML and Markdown delimiters | Google says pick one. Each PromptHub profile uses a single delimiter style per prompt. |
| Agentic persistence boilerplate ("keep going until fully resolved") | Written for agent loops [OAI-L, GEM]; noise in a single-turn chat prompt. |
| Stating knowledge cutoff | Documented only for Gemini 3 Flash agent setups; PromptHub can't know the user's model version. Not emitted. |

## 9. PromptHub target profiles (summary of `src/lib/prompting/profiles/`)

Implemented in `src/lib/prompting/`: `brief.ts` (the target-neutral brief), `profiles/{chatgpt,claude,
gemini}.ts` (each has a deterministic `render()` plus a `guidance` list that Phase 3 passes to the AI
writer, so model-written prompts follow the same rules), `evaluate.ts` (the rubric in §10) and
`shared.ts` (length targets, banned phrases, long-material threshold). Tests:
`tests/unit/prompting/profiles.test.ts` with six fixtures in `fixtures.ts`.

All profiles take the same structured **brief** (task, goal, audience, context, requirements,
constraints, output format, length, tone, user examples, long material) and must keep every user
requirement verbatim or as an explicit paraphrase. Differences:

| Dimension | ChatGPT | Claude | Gemini |
| --- | --- | --- | --- |
| Opening | Goal-first sentence (role only if specific) | Role sentence if specific, then the task in plain words | Task as a direct imperative first, persona merged into it if needed |
| Delimiters | Markdown `##` sections | XML tags | Markdown `##` sections |
| Requirements phrasing | Numbered steps when order matters, else bullets | Bullets inside `<requirements>`, with a short *because* for non-obvious ones | Terse bullets; ambiguous terms defined |
| Success criteria | Explicit "Done when" line | Folded into `<output_format>` | "Output" section with concrete size |
| Ambiguity | "If anything is unclear, state your assumption and continue." | Context supplied up front instead | Terms defined inline |
| Long material | Instructions first, material last, closing line restates task | `<material>` (or `<document>`s) first, task last in `<task>` | Task, constraints and format first; then material; then "Based on the material above, …" and a grounding line |
| Verbosity | Concrete target, no "be concise" | Concrete target; Detailed adds an explicit scope extension | Concrete target; Detailed adds explicit "include…" detail list |
| Date line | — | — | "Today is …" for recency-dependent research and planning |
| Source grounding | Per task (§6a) | Per task (§6a) | Per task (§6a) |

## 10. Evaluation plan (no superiority claims without comparison)

**Automated (deterministic, in Vitest now):** six identical tasks (coding, research, creative writing,
analysis, planning, productivity) × three targets × three lengths, rendered through the profiles and
scored on:
1. **Intent preservation:** every user requirement and key term appears in the output.
2. **Clarity:** has a task statement in the first block; no unresolved placeholders.
3. **Completeness:** goal, requirements, output format and length target are present.
4. **Actionability:** imperative task sentence; concrete length target.
5. **Context:** user context and material present; long material placed per profile order.
6. **Formatting:** a single delimiter style; profile-specific structure present.
7. **Unnecessary instructions:** none of the banned phrases from §8.
8. **Length:** within the profile's budget per length setting, and ordered Concise < Balanced < Detailed.
9. **Differentiation:** the three targets' outputs for the same task differ structurally, not only in
   headings (normalized-text similarity below a threshold).

Status 2026-11-23: 101 of 101 checks pass (80 profile checks plus 21 grounding checks) (6 tasks × 3 targets × 3 lengths on the rubric, plus
differentiation, length ordering, no-API-wrapper and documented-behaviour tests).

These checks verify that the **profiles follow the documented guidance**. They do **not** show that one
profile gets better answers from a model.

**Live generation check (opt-in, Gemini free tier only):** `npm run eval:gemini` sends the six fixture
ideas through the real Gemini pipeline for all three targets and scores each generated prompt with the
same deterministic rubric. It uses only the owner's free-tier key, it never runs in CI and it is capped
by a request budget. It checks that the *model-written* prompts follow each profile. It does not measure
answer quality on ChatGPT, Claude or Gemini.

**Downstream comparison (not automated):** PromptHub calls no OpenAI or Anthropic API, so whether a
Claude-profile prompt gets a better answer from Claude than a raw idea can only be tested by hand: paste
both into each platform, blind the outputs and rate them. Until that is done and reported with sample
sizes, the product claims only "structured following each vendor's published guidance."

## 11. Re-verification, 2026-11-24

All three guides were re-read (OpenAI, Anthropic at platform.claude.com, Google at aistudio.google.com).
Every claim in §1–8 is still supported. The precise wording changed in places:

| Claim | Current wording |
| --- | --- |
| [OAI] section order | Still Identity, Instructions, Examples, Context, "though the exact optimal content and order may vary by which model you are using". |
| [OAI-L] assumptions | "Make reasonable, reversible assumptions … and state them if it progresses the task within scope." The ChatGPT assumption line stays limited to deliverable tasks. |
| [OAI-L] self-contained | "The final answer must always be fully self-contained." |
| [OAI-R] zero-shot first | Only on the o-series reasoning page. Google says the opposite ("Prompts without few-shot examples are likely to be less effective"). PromptHub's policy (§4: never invent examples, include the user's own) satisfies both. |
| [ANT] prefill | Unsupported "starting with Claude 4.6 models"; older models still accept it. Not relevant to consumer chat. |
| [ANT] verbosity | Latest models are "less verbose", except Opus 5, whose default responses "run longer". |
| [GEM] verbosity | "By default, Gemini 3 models provide direct and efficient answers … you must explicitly request" detail. |
| [GEM] reasoning | "Generally not necessary" to have the model outline its reasoning, not a ban. The default stays: no visible-reasoning instruction unless the user wants one. |

New guidance that affects PromptHub:
- **[GEM] Sampling parameters:** "Gemini 4 and Gemini 3.6+ models ignore custom values for temperature,
  top_p, and top_k." The Gemini generation engine therefore sends none of them.
- **[ANT] Model-specific pages:** Anthropic now publishes a prompting page per model. PromptHub can't know
  which Claude model the user runs, so the Claude profile stays on the guidance common to all of them.
- **[OAI] Prompt objects** are being retired in favour of prompts kept in application code. This doesn't
  affect consumer prompts.

## Sources

- **[OAI]** OpenAI, *Prompt engineering* — https://developers.openai.com/api/docs/guides/prompt-engineering
- **[OAI-R]** OpenAI, *Reasoning best practices* — https://developers.openai.com/api/docs/guides/reasoning-best-practices
- **[OAI-L]** OpenAI, *Latest model prompting best practices* (GPT-6.2 at time of reading) — https://developers.openai.com/api/docs/guides/latest-model
- **[ANT]** Anthropic, *Prompt engineering overview* (now redirects to platform.claude.com) — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview and *Prompting best practices* — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- **[GEM]** Google, *Prompt design strategies* (ai.google.dev now redirects to aistudio.google.com) — https://aistudio.google.com/docs/prompting-strategies
