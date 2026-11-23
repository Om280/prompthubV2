/** Preview states for /design/c. Kept free of "use client" so the server page can read them. */
export const PREVIEW_STATES = ["empty", "questions", "generating", "result", "copied", "history", "signed-in"] as const;
export type PreviewState = (typeof PREVIEW_STATES)[number];
export const PREVIEW_LABELS: Record<PreviewState, string> = {
  empty: "Empty",
  questions: "Questions",
  generating: "Generating",
  result: "Result",
  copied: "Copied",
  history: "History",
  "signed-in": "Signed in",
};
