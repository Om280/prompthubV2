/**
 * What an idea already says, detected by phrase patterns. Used to skip clarifying questions the
 * user has already answered and to fill brief fields only from explicit statements.
 */

const PEOPLE =
  "manager|managers|boss|team|teammates|colleagues?|co-?workers?|clients?|customers?|users?|kids?|children|students?|teachers?|beginners?|experts?|developers?|engineers?|executives?|investors?|board|stakeholders?|parents?|friends?|family|readers?|audience|landlord|tenants?|recruiters?|hiring managers?|professor|class|followers|subscribers|employees|staff|partner|wife|husband|mom|dad|mum|mother|father|sister|brother|son|daughter|grandma|grandpa|grandmother|grandfather|neighbou?rs?|doctor|patients?|community|seniors|toddlers|teens?|teenagers?|adults?|non-experts|newbies|novices|interviewer|hr|ceo|cto|founders?|vendor|supplier|coach|mentor|girlfriend|boyfriend|roommates?|guests?";

export const AUDIENCE_RE = new RegExp(
  String.raw`\b(for|to|aimed at|targeted at|targeting|written for|audience(?: is|:)?|explain(?:ed)? to)\s+(?:my|our|a|an|the|some|his|her|their)?\s*(?:[\w-]+\s+){0,2}?(?:${PEOPLE})\b|\b(?:${PEOPLE})\s+(?:will|who)\s+(?:read|receive|use)|\blike i'?m (?:five|5|a beginner)|\beli5\b`,
  "i",
);

export const FORMAT_RE =
  /\b(table|bullet(?:ed)?(?: points?| list)?|bullets|numbered list|checklist|json|csv|yaml|markdown|outline|slides?|slide deck|tweet|thread|haiku|poem|limerick|sonnet|essay|one[- ]pager|faq|flowchart|diagram|itinerary|step[- ]by[- ]step guide|spreadsheet|paragraphs?)\b|\b(?:as|in|into)\s+(?:an?\s+)?(?:list|summary|report|email|letter|memo|script)\b/i;

/** An explicit output shape stated with "as/in/into …", turned into an outputFormat phrase. */
export function explicitFormat(text: string): string | null {
  const m = text.match(
    /\b(?:as|in|into|in the form of|formatted as)\s+(an?\s+|the\s+)?((?:markdown\s+|short\s+|simple\s+|numbered\s+|bulleted\s+|bullet\s+)?(?:table|list|bullet points|bullets|checklist|json|csv|yaml|outline|email|poem|haiku|essay|summary|report|memo|letter|slides|slide deck|thread|one-pager|faq|paragraphs?))\b/i,
  );
  if (!m) return null;
  const noun = m[2].toLowerCase();
  if (/^(json|csv|yaml)$/.test(noun)) return noun.toUpperCase();
  if (/s$/.test(noun)) return noun;
  return /^[aeiou]/.test(noun) ? `an ${noun}` : `a ${noun}`;
}

export const GOAL_RE =
  /\b(so (?:that|i|we) |in order to|to help me|because|for (?:my|a|an|our|the) (?:presentation|meeting|interview|report|class|assignment|exam|pitch|launch|blog|newsletter|website|portfolio|application|thesis|paper|talk)|i(?:'m| am) (?:trying|hoping|going) to|the goal is|my goal|purpose)\b/i;

export const CONSTRAINT_RE =
  /\b(without|avoid|don'?t|do not|no more than|at most|under \d|less than|only use|use only|must(?: not)?|max(?:imum)?|limit(?:ed)? to|no longer than|strictly)\b/i;

export const TONE_RE =
  /\b(friendly|formal|informal|casual|professional|funny|humou?rous|playful|serious|warm|polite|firm|direct|blunt|persuasive|witty|sarcastic|heartfelt|upbeat|dark|whimsical|light-?hearted|tone|voice|style of|in the style)\b/i;

export const NUMBER_RE = /\d/;

export const BUDGET_RE =
  /(?:[$€£¥]\s?\d|\d\s?(?:k\b|dollars|usd|eur|euros|gbp|pounds|bucks|rupees|inr))|\bbudget\b|\bcheap\b|\bfree\b|\blow[- ]cost\b|\baffordable\b/i;

export const TIMEFRAME_RE =
  /\b\d+\s*-?\s*(?:minutes?|mins?|hours?|days?|weeks?|months?|years?)\b|\b(?:one|two|three|four|five|six|a|this|next)\s+(?:day|week|weekend|month|year)s?\b|\bweekend\b|\btomorrow\b|\btonight\b|\bby (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|the end of)\b|\b(?:in|over|during) (?:january|february|march|april|may|june|july|august|september|october|november|december|spring|summer|autumn|fall|winter)\b|\bdaily\b|\bweekly\b/i;

export const LANGUAGE_RE =
  /\b(python|javascript|typescript|java|c\+\+|c#|golang|rust|ruby|php|swift|kotlin|scala|bash|shell|powershell|sql|postgres(?:ql)?|mysql|sqlite|matlab|haskell|elixir|dart|flutter|react|vue|angular|svelte|next\.?js|node(?:\.?js)?|django|flask|fastapi|rails|spring|html|css|tailwind|excel|google sheets|vba|lua|perl)\b|\b(?:in|using|with|written in) (?:go|c|r)\b/i;

export const RUNTIME_RE =
  /\b(cli|command[- ]line|terminal|browser|frontend|front-end|backend|back-end|server|serverless|lambda|cron|script|notebook|jupyter|mobile|ios|android|desktop|web app|website|api|microservice|docker|raspberry pi|arduino|windows|macos|linux|excel|google sheets)\b/i;

export const EXAMPLE_RE = /\b(e\.g\.|for example|for instance|example:|like this:|such as this|here'?s an example|sample:)\b/i;

/** Phrases that explicitly restrict the answer to the user's own material. */
export const MATERIAL_ONLY_RE =
  /\b(?:only use|use only|using only|based (?:only|solely|strictly|purely) on|stick (?:strictly |only )?to|only (?:from|on)|nothing (?:beyond|outside))\s+(?:the|this|my|these|what)\s+(?:\w+\s+)?(?:material|text|data|document|doc|article|notes|transcript|content|information|info|paste|pasted|above|below|following|provided|sources?|file|report|code|i (?:gave|pasted|provided|shared))\b/i;

/** Current information: prices, news, availability, schedules, "latest". */
export const RECENCY_RE =
  /\b(current|currently|latest|recent|recently|today|tonight|this (?:year|week|month|season)|right now|nowadays|news|prices?|pricing|costs?|rates?|deals|availability|available|schedules?|opening hours|travel|trip|flights?|hotels?|itinerary|tickets?|up[- ]to[- ]date|trending|newest|20[2-9]\d|regulations?|laws?|incentives?|rebates?|market)\b/i;

export const VISIBLE_REASONING_RE = /\bshow (?:your|the|all) (?:work|working|reasoning|steps|calculations?)\b/i;

/** Answers that decline the question. */
export const DECLINE_RE = /^(?:no|nope|none|n\/a|na|nothing|not really|no preference|skip|-|any|anything|whatever|idk|i don'?t know|not sure)[.!]?$/i;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
