import type { Engine, PromptRecord, TargetPlatform, VersionRecord, VersionSource } from "@/lib/contracts";
import { renderMock } from "./adapter";
import { briefByKey } from "./briefs";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const ENGINE: Engine = { kind: "ai", provider: "anthropic", model: "claude-sonnet-5-5" };

interface SeedSpec {
  key: string;
  target: TargetPlatform;
  ago: number;
  deletedAgo?: number;
  steps: VersionSource[];
}

const SPECS: SeedSpec[] = [
  { key: "landlord", target: "chatgpt", ago: 2 * MIN, steps: ["generated", "shortened", "improved"] },
  { key: "sql", target: "claude", ago: 1 * HOUR, steps: ["generated"] },
  { key: "planning", target: "gemini", ago: 26 * HOUR, steps: ["generated", "tone"] },
  { key: "coding", target: "claude", ago: 3 * DAY, steps: ["generated", "expanded"] },
  { key: "research", target: "chatgpt", ago: 5 * DAY, steps: ["generated"] },
  { key: "creative", target: "claude", ago: 12 * DAY, steps: ["generated", "edited"] },
  { key: "analysis", target: "gemini", ago: 20 * DAY, deletedAgo: 2 * DAY, steps: ["generated"] },
  { key: "productivity", target: "chatgpt", ago: 9 * DAY, deletedAgo: 6 * HOUR, steps: ["generated"] },
];

export function buildHistorySeed(now: number): { prompts: PromptRecord[]; versions: VersionRecord[] } {
  const prompts: PromptRecord[] = [];
  const versions: VersionRecord[] = [];
  for (const spec of SPECS) {
    const mb = briefByKey(spec.key);
    const id = `seed-${spec.key}`;
    const created = now - spec.ago - spec.steps.length * 4 * MIN;
    let lastId = "";
    spec.steps.forEach((source, i) => {
      const length = source === "shortened" ? "concise" : source === "expanded" ? "detailed" : "balanced";
      const tone = source === "tone" ? "friendly" : undefined;
      const answers = mb.questions.slice(0, 2).map((q) => ({
        questionId: q.id,
        question: q.question,
        answer: q.suggestions[0] ?? "Not sure",
      }));
      let { text } = renderMock(mb.idea, { target: spec.target, length, tone, answers });
      if (source === "edited") text = text.replace(/\n*$/, "\n\nKeep the radio's voice in italics.");
      lastId = `${id}-v${i + 1}`;
      versions.push({
        id: lastId,
        promptId: id,
        content: text,
        source,
        tone,
        engine: source === "edited" ? { kind: "manual" } : ENGINE,
        createdAt: i === spec.steps.length - 1 ? now - spec.ago : created + i * 4 * MIN,
      });
    });
    prompts.push({
      id,
      title: mb.title,
      idea: mb.idea,
      target: spec.target,
      length: "balanced",
      answers: mb.questions.slice(0, 2).map((q) => ({
        questionId: q.id,
        question: q.question,
        answer: q.suggestions[0] ?? "Not sure",
      })),
      currentVersionId: lastId,
      createdAt: created,
      updatedAt: now - spec.ago,
      deletedAt: spec.deletedAgo !== undefined ? now - spec.deletedAgo : null,
    });
  }
  return { prompts, versions };
}
