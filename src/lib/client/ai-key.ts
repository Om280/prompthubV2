/**
 * The user's own OpenRouter key, held in memory only. Client-side.
 *
 * The key lives in a module variable for the life of this tab and nowhere else: never
 * `localStorage`, `sessionStorage`, IndexedDB or cookies. It is cleared:
 * - on explicit disconnect (`clear()` / `disconnect()`);
 * - on sign-out (the auth layer calls `clear()`);
 * - on `pagehide` (tab closed, navigated away or put in the back/forward cache).
 *
 * Future AI requests send it in the `X-OpenRouter-Key` header (see `src/lib/server/user-key.ts`).
 * There is no UI to enter a key yet: AI generation isn't built.
 */

type Listener = (hasKey: boolean) => void;

export interface AiKeyHolder {
  set(key: string): void;
  get(): string | null;
  has(): boolean;
  clear(): void;
  /** Same as `clear()`; named for the "Disconnect" action. */
  disconnect(): void;
  subscribe(listener: Listener): () => void;
}

export const AI_KEY_HEADER = "X-OpenRouter-Key";

export interface AiKeyHolderOptions {
  /** The window whose `pagehide` clears the key. Defaults to the global window when present. */
  target?: Pick<Window, "addEventListener" | "removeEventListener"> | null;
}

export function createAiKeyHolder(options: AiKeyHolderOptions = {}): AiKeyHolder {
  let key: string | null = null;
  const listeners = new Set<Listener>();
  const target = options.target !== undefined ? options.target : typeof window !== "undefined" ? window : null;
  let listening = false;

  const notify = () => {
    for (const l of listeners) l(key !== null);
  };

  const onPageHide = () => clear();

  function clear() {
    const had = key !== null;
    key = null;
    if (listening && target) {
      target.removeEventListener("pagehide", onPageHide);
      listening = false;
    }
    if (had) notify();
  }

  return {
    set(value) {
      const trimmed = value.trim();
      if (!trimmed) {
        clear();
        return;
      }
      key = trimmed;
      if (!listening && target) {
        target.addEventListener("pagehide", onPageHide);
        listening = true;
      }
      notify();
    },
    get: () => key,
    has: () => key !== null,
    clear,
    disconnect: clear,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The app's single holder. */
export const aiKey: AiKeyHolder = createAiKeyHolder();

/** Headers for a future AI request: the key header only when a key is held. */
export function aiKeyHeaders(holder: AiKeyHolder = aiKey): Record<string, string> {
  const k = holder.get();
  return k ? { [AI_KEY_HEADER]: k } : {};
}
