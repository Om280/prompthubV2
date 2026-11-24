#!/usr/bin/env node
/**
 * Opt-in evaluation of the real Gemini pipeline (free tier). NEVER runs in CI or `npm test`.
 *
 *   node scripts/eval-gemini.mjs --confirm-free-tier [--env .env.local] [--budget 18]
 *                                [--length balanced] [--length detailed] [--smoke]
 *
 * - Default run: the 6 fixture ideas (tests/unit/prompting/fixtures.ts) × 3 targets × Balanced,
 *   through the same code the app uses (Gemini brief → target profile → evaluatePrompt), scored and
 *   written to reports/eval-gemini-<timestamp>.md (reports/ is ignored by its own .gitignore).
 * - --smoke: exactly one clarify, one generate and one transform call, to check the setup.
 * - Hard request budget (default 18, --budget N): every Gemini request counts, repairs included. The
 *   run stops before the request that would exceed it. Nothing retries (maxRetries 0).
 * - Refuses unless --confirm-free-tier is given, GEMINI_MODEL is on the free-tier allowlist and
 *   AI_ENABLED isn't false. Refuses when CI is set.
 * - Secrets are read from the env file (default .env.local) into this process only. Values are never
 *   printed or written to the report.
 *
 * This script calls Google's Gemini API with the owner's key. On the free tier, Google may use the
 * content to improve its products; the fixtures contain no personal data.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* ---------------------------------------------------------------- args */

function parseArgs(argv) {
  const out = { confirm: false, env: ".env.local", budget: 18, lengths: [], smoke: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) fail(`${a} needs a value`);
      return v;
    };
    if (a === "--confirm-free-tier") out.confirm = true;
    else if (a === "--env") out.env = next();
    else if (a === "--budget") out.budget = Number(next());
    else if (a === "--length") out.lengths.push(next());
    else if (a === "--smoke") out.smoke = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else fail(`unknown argument: ${a}`);
  }
  if (!Number.isInteger(out.budget) || out.budget < 1) fail("--budget must be a whole number ≥ 1");
  if (out.lengths.length === 0) out.lengths = ["balanced"];
  for (const l of out.lengths) if (!["concise", "balanced", "detailed"].includes(l)) fail(`--length must be concise, balanced or detailed (got ${l})`);
  return out;
}

function fail(message) {
  console.error(`eval-gemini: ${message}`);
  process.exit(2);
}

/* ---------------------------------------------------------------- env file (values never printed) */

function loadEnvFile(file) {
  const p = path.resolve(process.cwd(), file);
  if (!existsSync(p)) fail(`env file not found: ${file}`);
  const names = [];
  for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    names.push(m[1]);
  }
  return names;
}

/* ---------------------------------------------------------------- load the app's TS modules */

async function loadModules() {
  const { createServer } = await import("vite");
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, watch: null },
    resolve: {
      tsconfigPaths: true,
      alias: { "server-only": path.join(root, "node_modules/server-only/empty.js") },
    },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const load = (p) => server.ssrLoadModule(path.join(root, p));
  const mods = {
    models: await load("src/lib/ai/gemini-models.ts"),
    env: await load("src/lib/server/env.ts"),
    provider: await load("src/lib/ai/gemini/provider.ts"),
    call: await load("src/lib/ai/gemini/call.ts"),
    clarify: await load("src/lib/ai/gemini/clarify.ts"),
    generate: await load("src/lib/ai/gemini/generate.ts"),
    transform: await load("src/lib/ai/gemini/transform.ts"),
    prompting: await load("src/lib/prompting/index.ts"),
    evaluate: await load("src/lib/prompting/evaluate.ts"),
    fixtures: await load("tests/unit/prompting/fixtures.ts"),
  };
  return { mods, close: () => server.close() };
}

/* ---------------------------------------------------------------- budget */

class BudgetExceeded extends Error {
  constructor(budget) {
    super(`request budget of ${budget} reached; stopping`);
    this.name = "BudgetExceeded";
  }
}

/** Wraps a LanguageModel so each doGenerate/doStream counts against the hard budget. */
function budgeted(model, state) {
  const take = () => {
    if (state.used >= state.budget) throw new BudgetExceeded(state.budget);
    state.used++;
  };
  return new Proxy(model, {
    get(target, prop, receiver) {
      if (prop === "doGenerate" || prop === "doStream") {
        return (...args) => {
          take();
          return target[prop](...args);
        };
      }
      const v = Reflect.get(target, prop, receiver);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

/* ---------------------------------------------------------------- fixtures as user input */

function answersFor(b) {
  const join = (xs) => xs.filter(Boolean).join(". ");
  return [
    { questionId: "q1", question: "What's the background?", answer: join([b.goal, b.audience, ...b.context]) },
    { questionId: "q2", question: "What must it include?", answer: join(b.requirements.flatMap((r) => [r.text, r.reason])) },
    {
      questionId: "q3",
      question: "Any limits?",
      answer: join([...b.constraints.flatMap((c) => [c.text, c.reason]), ...(b.definitions ?? []).map((d) => `By ${d.term} I mean ${d.meaning}`), b.outputFormat]),
    },
    ...((b.examples ?? []).length ? [{ questionId: "q4", question: "Do you have an example?", answer: b.examples.join("\n\n") }] : []),
  ]
    .filter((a) => a.answer.trim())
    .map((a) => ({ ...a, answer: a.answer.slice(0, 1000) }));
}

function ideaFor(fx) {
  const m = fx.brief.material ?? [];
  return [fx.idea, ...m.map((x) => (x.content.length > 1500 ? x.content : "```\n" + x.content + "\n```"))].join("\n\n");
}

/* ---------------------------------------------------------------- main */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
    return;
  }
  if (process.env.CI) fail("refusing to run in CI (it calls the real Gemini API)");
  if (!args.confirm) fail("refusing to run without --confirm-free-tier (it calls the real Gemini API on the owner's free tier)");

  const loaded = loadEnvFile(args.env);
  console.log(`eval-gemini: read ${loaded.length} variables from ${args.env} (values not shown)`);
  if (!process.env.GEMINI_API_KEY?.trim()) fail("GEMINI_API_KEY isn't set in the env file");

  const { mods, close } = await loadModules();
  try {
    const env = mods.env.readServerEnv();
    if (!env.aiEnabled) fail("AI_ENABLED is false");
    const check = mods.models.checkGeminiModel(env.geminiModel);
    if (!check.ok) fail(check.message);

    const budget = args.smoke ? Math.min(args.budget, 3) : args.budget;
    const state = { used: 0, budget };
    const model = budgeted(mods.provider.createGeminiModel(check.model), state);
    const call = () => ({
      model,
      signal: AbortSignal.timeout(env.ai.timeoutMs),
      timeoutMs: env.ai.timeoutMs,
      maxOutputTokens: env.ai.maxOutputTokens,
      thinkingLevel: env.thinkingLevel ?? "low",
    });
    const today = new Date().toISOString().slice(0, 10);
    console.log(`eval-gemini: model ${check.model}, thinking ${env.thinkingLevel}, max output ${env.ai.maxOutputTokens}, budget ${budget} requests${args.smoke ? " (smoke)" : ""}`);

    const rows = [];
    const record = (row) => {
      rows.push(row);
      console.log(`  ${row.kind.padEnd(9)} ${row.name.padEnd(13)} ${row.target.padEnd(8)} ${row.status}${row.note ? `  ${row.note}` : ""}`);
    };
    const failure = (e) => (e instanceof BudgetExceeded ? "budget" : e?.code ? `${e.code}` : e?.name ?? "error");

    const fixtures = mods.fixtures.FIXTURES;
    if (args.smoke) {
      const fx = fixtures.find((f) => f.name === "planning") ?? fixtures[0];
      const meter = () => new mods.call.UsageMeter();
      // 1. clarify
      try {
        const m = meter();
        const r = await mods.clarify.geminiClarify({ idea: fx.idea, target: "gemini", length: "balanced" }, call(), m);
        record({ kind: "clarify", name: fx.name, target: "gemini", status: "ok", note: `${r.questions.length} question(s), task ${r.taskType}`, tokens: m.summary() });
      } catch (e) {
        record({ kind: "clarify", name: fx.name, target: "gemini", status: `FAILED (${failure(e)})` });
      }
      // 2. generate
      let generated = null;
      try {
        const m = meter();
        const g = await mods.generate.geminiGenerate({ req: { idea: ideaFor(fx), target: "chatgpt", length: "balanced", answers: answersFor(fx.brief) }, today }, call(), m);
        generated = g.text;
        record({ kind: "generate", name: fx.name, target: "chatgpt", status: g.evaluation.passed ? "pass" : "fail", note: failedCriteria(g.evaluation), tokens: m.summary(), text: g.text });
      } catch (e) {
        record({ kind: "generate", name: fx.name, target: "chatgpt", status: `FAILED (${failure(e)})` });
      }
      // 3. transform (improve) of the generated prompt, or of the locally rendered one
      try {
        const m = meter();
        const text = generated ?? mods.prompting.renderPrompt("chatgpt", fx.brief, { today });
        const it = mods.transform.geminiTransform({ action: "improve", text, target: "chatgpt", length: "balanced", idea: fx.idea }, call(), m);
        let r = await it.next();
        let deltas = 0;
        while (!r.done) {
          deltas++;
          r = await it.next();
        }
        record({ kind: "transform", name: fx.name, target: "chatgpt", status: r.value.truncated ? "truncated" : "ok", note: `${deltas} delta(s)${r.value.repaired ? ", repaired" : ""}`, tokens: m.summary(), text: r.value.text });
      } catch (e) {
        record({ kind: "transform", name: fx.name, target: "chatgpt", status: `FAILED (${failure(e)})` });
      }
    } else {
      outer: for (const length of args.lengths) {
        for (const fx of fixtures) {
          for (const target of ["chatgpt", "claude", "gemini"]) {
            if (state.used >= state.budget) {
              record({ kind: "generate", name: fx.name, target, status: "SKIPPED (budget)" });
              break outer;
            }
            const m = new mods.call.UsageMeter();
            try {
              const g = await mods.generate.geminiGenerate({ req: { idea: ideaFor(fx), target, length, answers: answersFor(fx.brief) }, today }, call(), m);
              const ev = mods.evaluate.evaluatePrompt(mods.prompting.PROFILES[target], g.brief, g.text, fx.mustContain);
              record({
                kind: "generate",
                name: fx.name,
                target,
                length,
                status: ev.passed ? "pass" : "fail",
                note: [failedCriteria(ev), g.repaired ? "repaired" : "", g.dropped ? `${g.dropped} dropped` : "", g.restoredAnswers ? `${g.restoredAnswers} answer(s) restored` : ""].filter(Boolean).join("; "),
                overhead: ev.overhead,
                chars: ev.chars,
                tokens: m.summary(),
                text: g.text,
              });
            } catch (e) {
              record({ kind: "generate", name: fx.name, target, length, status: `FAILED (${failure(e)})` });
              if (e instanceof BudgetExceeded) break outer;
            }
          }
        }
      }
    }

    const file = writeReport({ rows, model: check.model, thinking: env.thinkingLevel, budget, used: state.used, smoke: args.smoke, lengths: args.lengths });
    console.log(`eval-gemini: ${state.used}/${budget} requests used. Report: ${path.relative(process.cwd(), file)}`);
  } finally {
    await close();
  }
}

function failedCriteria(ev) {
  const failed = Object.entries(ev.results)
    .filter(([, r]) => !r.pass)
    .map(([k, r]) => `${k} (${r.notes.join("; ")})`);
  return failed.length ? `failed: ${failed.join(", ")}` : "";
}

function writeReport({ rows, model, thinking, budget, used, smoke, lengths }) {
  const dir = path.join(root, "reports");
  mkdirSync(dir, { recursive: true });
  const ignore = path.join(dir, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, "# Local eval output; never committed.\n*\n");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `eval-gemini-${smoke ? "smoke-" : ""}${stamp}.md`);
  const scored = rows.filter((r) => r.status === "pass" || r.status === "fail");
  const passed = rows.filter((r) => r.status === "pass").length;
  const tok = (t) => (t && t.inputTokens !== null ? `${t.inputTokens} / ${t.outputTokens}` : "n/a");
  const md = [
    `# Gemini eval${smoke ? " (smoke)" : ""}, ${new Date().toISOString()}`,
    "",
    `- Model: \`${model}\` (free tier), thinking level \`${thinking}\``,
    `- Lengths: ${smoke ? "balanced" : lengths.join(", ")}`,
    `- Requests: ${used} of a hard budget of ${budget} (repairs included, no retries)`,
    `- Rubric: \`evaluatePrompt()\` (PROMPTING_RESEARCH §10). It checks profile fidelity and intent preservation, not answer quality.`,
    smoke ? "" : `- Passed: ${passed} of ${scored.length} scored`,
    "",
    "| Kind | Fixture | Target | Result | Tokens in / out | Overhead | Notes |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((r) => `| ${r.kind} | ${r.name} | ${r.target}${r.length ? ` (${r.length})` : ""} | ${r.status} | ${tok(r.tokens)} | ${r.overhead ?? ""} | ${(r.note ?? "").replace(/\|/g, "\\|")} |`),
    "",
    "## Outputs",
    "",
    ...rows
      .filter((r) => r.text)
      .flatMap((r) => [`<details><summary>${r.kind}: ${r.name} → ${r.target}</summary>`, "", "````text", r.text, "````", "", "</details>", ""]),
  ].join("\n");
  writeFileSync(file, md);
  return file;
}

main().catch((e) => {
  // Never print error bodies (they could echo request data); name and code only.
  console.error(`eval-gemini: stopped (${e?.name ?? "error"}${e?.code ? ` ${e.code}` : ""})`);
  process.exit(1);
});
