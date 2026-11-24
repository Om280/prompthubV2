/**
 * The AI disclosure shown before a user's first AI request (the first-use notice comes with AI
 * generation in a later phase). Shared, no secrets; safe to import from client components.
 *
 * Source for the free-tier data-use statement: Google's Gemini API pricing page, whose free tier
 * card says "Content used to improve our products" (the paid card says "not used"). Checked
 * 2026-11-23: https://aistudio.google.com/docs/pricing
 */

export const GEMINI_PRICING_URL = "https://aistudio.google.com/docs/pricing";

export const AI_DISCLOSURE = {
  title: "Before you use AI",
  body: [
    "AI features send your idea, your answers and your prompt text to Google's Gemini API to write or rewrite the prompt.",
    "PromptHub uses Gemini's free tier. On the free tier, Google may use the content you send to improve its products.",
    "Don't include personal, confidential or sensitive information in anything you send to AI.",
    "Basic Mode sends nothing to Google. Your history stays in this browser either way.",
  ],
  sourceLabel: "Google's Gemini API pricing and data-use terms",
  sourceUrl: GEMINI_PRICING_URL,
  accept: "I understand, use AI",
  decline: "Keep using Basic Mode",
} as const;
