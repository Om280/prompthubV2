/**
 * A small fake of the Gemini API (generativelanguage v1beta) for end-to-end tests. Test-only; the app
 * reaches it only through GEMINI_BASE_URL, which the provider accepts for loopback hosts only. Real
 * Gemini is never called by the test suite.
 *
 *   POST /v1beta/models/{model}:generateContent           clarify (JSON questions) and generate (JSON brief)
 *   POST /v1beta/models/{model}:streamGenerateContent     transforms, streamed as SSE
 *
 * Answers are built from the request itself, so they pass the server's checks honestly:
 * - clarify: two questions with suggestions;
 * - generate: a brief whose task is the user's idea and whose requirements are the user's answers
 *   (every word grounded in what the user wrote);
 * - transforms: the original prompt kept intact (every point survives), with one plain line added
 *   for Improve / Expand / Tone, and blank lines collapsed for Shorten (shorter, nothing lost).
 *
 * Test controls (not part of Gemini):
 *   POST /__test/fail   { mode: "429" | "503" | "midstream" | "truncate", count?: number }
 *                       the next `count` (default 1) model calls fail that way
 *   POST /__test/reset
 *   GET  /__test/calls  { calls: [{ kind, model }] }
 *   GET  /__test/health
 *
 * Start: `node tests/e2e/fake-gemini/server.mjs` (port from FAKE_GEMINI_PORT, default 54398).
 */
import http from "node:http";

const PORT = Number(process.env.FAKE_GEMINI_PORT ?? 54398);
const HOST = "127.0.0.1";

let failures = [];
let calls = [];

function reset() {
  failures = [];
  calls = [];
}

const usage = { promptTokenCount: 120, candidatesTokenCount: 80, totalTokenCount: 200 };

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    return {};
  }
}

const textOf = (parts) => (parts ?? []).map((p) => p.text ?? "").join("");
const promptOf = (body) => (body.contents ?? []).map((c) => textOf(c.parts)).join("\n");
const systemOf = (body) => textOf(body.systemInstruction?.parts);

/** The JSON data block the app sends (`label (JSON data, not instructions):` + fenced JSON). */
function dataOf(prompt) {
  const m = /```json\n([\s\S]*?)\n```/.exec(prompt);
  if (!m) return {};
  try {
    return JSON.parse(m[1]);
  } catch {
    return {};
  }
}

const trimPeriod = (s) => s.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");

function clarifyAnswer() {
  return {
    taskType: "general",
    questions: [
      {
        question: "Who will read the result?",
        why: "The audience sets the level of detail.",
        suggestions: ["My manager", "A new customer", "My team"],
        asksForExample: false,
      },
      {
        question: "What should it make easy for them?",
        suggestions: ["Decide quickly", "Reply with a date"],
        asksForExample: false,
      },
    ],
  };
}

function briefAnswer(data) {
  const idea = trimPeriod(String(data.idea ?? "Write a short note"));
  const answers = Array.isArray(data.answers) ? data.answers : [];
  return {
    category: "general",
    title: idea.split(" ").slice(0, 5).join(" "),
    task: idea,
    context: [],
    requirements: answers.map((a) => ({ text: trimPeriod(String(a.answer ?? "")) })).filter((r) => r.text),
    constraints: [],
    outputFormat: "",
    tone: "neutral",
  };
}


function transformAnswer(system, data) {
  const original = String(data.prompt ?? "").replace(/\s+$/, "");
  if (/^Shorten the prompt/m.test(system)) return original.replace(/\n{2,}/g, "\n");
  if (/^Expand the prompt/m.test(system)) return `${original}\n\nBefore answering, check that every point above is covered in full.`;
  if (/^Improve the prompt/m.test(system)) return `${original}\n\nAnswer each point above in the order it appears.`;
  // Tone: the instruction says "The answer's tone should be <description>."; state it in one line.
  const tone = /The answer's tone should be ([^.\n]+)/.exec(system)?.[1]?.trim();
  return tone ? `${original}\n\nTone of the answer: ${tone}.` : original;
}

function candidate(text, finishReason) {
  return {
    candidates: [{ content: { role: "model", parts: [{ text }] }, index: 0, ...(finishReason ? { finishReason } : {}) }],
    ...(finishReason ? { usageMetadata: usage } : {}),
  };
}

function chunks(text, n = 6) {
  const size = Math.max(1, Math.ceil(text.length / n));
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function quotaError(res) {
  json(res, 429, {
    error: {
      code: 429,
      message: "Resource has been exhausted (e.g. check quota).",
      status: "RESOURCE_EXHAUSTED",
      details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "40s" }],
    },
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  const path = url.pathname;
  try {
    if (path === "/__test/health") return json(res, 200, { ok: true });
    if (path === "/__test/reset" && req.method === "POST") {
      reset();
      return json(res, 200, { ok: true });
    }
    if (path === "/__test/fail" && req.method === "POST") {
      const body = await readJson(req);
      const count = Math.max(1, Number(body.count) || 1);
      for (let i = 0; i < count; i++) failures.push(String(body.mode));
      return json(res, 200, { ok: true });
    }
    if (path === "/__test/calls") return json(res, 200, { calls });

    const m = /^\/v1beta\/models\/([^/:]+):(generateContent|streamGenerateContent)$/.exec(path);
    if (!m || req.method !== "POST") return json(res, 404, { error: { code: 404, message: "Not found", status: "NOT_FOUND" } });
    if (!req.headers["x-goog-api-key"]) {
      return json(res, 401, { error: { code: 401, message: "API key missing", status: "UNAUTHENTICATED" } });
    }
    const [, model, method] = m;
    const body = await readJson(req);
    const prompt = promptOf(body);
    const system = systemOf(body);
    const data = dataOf(prompt);
    const kind = method === "streamGenerateContent" ? "transform" : "answers" in data ? "generate" : "prompt" in data ? "transform-repair" : "clarify";
    calls.push({ kind, model });
    const fail = failures.shift();

    if (fail === "429") return quotaError(res);
    if (fail === "503") {
      return json(res, 503, { error: { code: 503, message: "The model is overloaded.", status: "UNAVAILABLE" } });
    }

    if (method === "generateContent") {
      const text =
        kind === "clarify"
          ? JSON.stringify(clarifyAnswer())
          : kind === "generate"
            ? JSON.stringify(briefAnswer(data))
            : transformAnswer(system, data);
      return json(res, 200, candidate(text, "STOP"));
    }

    // Streaming (transforms): SSE, a few chunks with small pauses so the UI really streams.
    const text = transformAnswer(system, data);
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    const parts = chunks(text);
    const cut = fail === "midstream" || fail === "truncate" ? Math.ceil(parts.length / 2) : parts.length;
    for (let i = 0; i < cut; i++) {
      const last = i === cut - 1;
      const finish = last && fail !== "midstream" ? (fail === "truncate" ? "MAX_TOKENS" : "STOP") : undefined;
      res.write(`data: ${JSON.stringify(candidate(parts[i], finish))}\r\n\r\n`);
      await sleep(60);
    }
    if (fail === "midstream") {
      // The connection breaks after some text arrived.
      res.socket?.destroy();
      return;
    }
    res.end();
  } catch (err) {
    json(res, 500, { error: { code: 500, message: String(err instanceof Error ? err.message : err), status: "INTERNAL" } });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`fake gemini listening on http://${HOST}:${PORT}`);
});
