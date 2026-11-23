/**
 * Short history title from the idea: at most 6 meaningful words, sentence case, user's own words.
 */
import { splitMaterial } from "./classify";

const STOP = new Set(
  "a an the of for to in on at by with and or but from into about as is are be my our your me us it this that these those some any which who so".split(
    " ",
  ),
);

/** Leading request words that say nothing about the subject. */
const LEAD_RE =
  /^(?:(?:hi|hey|hello|ok|okay|so|please|pls|kindly)\b[,!.]?\s+|(?:can|could|would|will) (?:you|u)\s+|(?:i|we) (?:want|need|would like|wanna)(?: you)? to\s+|i'd like(?: you)? to\s+|(?:help|assist) (?:me|us)(?: to| with)?\s+|(?:i|we) need (?:some )?help (?:with )?|(?:i|we) (?:have|got|'ve got)\s+|here(?:'s| is)\s+|(?:i|we) (?:want|need|would like)\s+|give me\s+|tell me (?:about\s+)?|show me(?: how to)?\s+|how (?:do|can|should) (?:i|we)\s+|how to\s+|what (?:is|are)\s+|what's\s+|(?:write|create|make|build|draft|generate|compose|craft|prepare|produce|design|develop|implement|research|brainstorm|come up with|suggest|list|plan|analy[sz]e|summari[sz]e|explain|outline|describe)\s+)/i;

export const MAX_TITLE_WORDS = 6;

export function basicTitle(idea: string): string {
  const { instruction } = splitMaterial(idea);
  const firstLine = (instruction || idea).split("\n").find((l) => l.trim()) ?? "";
  // First clause only.
  let text = firstLine
    .split(/[.!?;:(]|,\s|\s[-–—]\s|\s+and\s+(?=(?:then\s+)?(?:tell|give|show|explain|list|find|make|write|summari[sz]e|suggest|create|send|draft)\b)/i)[0]
    .trim();
  for (let i = 0; i < 5; i++) {
    const next = text.replace(LEAD_RE, "").trim();
    if (next === text) break;
    text = next;
  }
  text = text.replace(/^(?:a|an|the|some|this|these|that|those)\s+/i, "");

  const words = text.split(/\s+/).filter(Boolean);
  const picked: string[] = [];
  let meaningful = 0;
  for (const w of words) {
    const bare = w.toLowerCase().replace(/[^\p{L}\p{N}'+#-]/gu, "");
    if (!bare) continue;
    const isStop = STOP.has(bare);
    if (!isStop && meaningful === MAX_TITLE_WORDS) break;
    picked.push(w.replace(/[",]+$/g, ""));
    if (!isStop) meaningful++;
  }
  while (picked.length && STOP.has(picked[picked.length - 1].toLowerCase())) picked.pop();

  const title = picked.join(" ").replace(/^["'`]+|["'`]+$/g, "").trim();
  if (!title) return "Untitled prompt";
  return (title[0].toUpperCase() + title.slice(1)).slice(0, 80);
}
