import { cn } from "@/lib/utils";

/**
 * Shortcut hint (DESIGN §6.10): condensed Mona Sans with tabular figures, not mono.
 * Hidden under 640px and on coarse pointers via `.kbd-hint`.
 */
export function Kbd({
  keys,
  className,
  tone = "default",
}: {
  keys: string[];
  className?: string;
  tone?: "default" | "on-accent";
}) {
  return (
    <span className={cn("kbd-hint items-center gap-0.5", className)} aria-hidden="true">
      {keys.map((k) => (
        <kbd
          key={k}
          className={cn(
            "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-xs px-[5px] font-sans type-kbd",
            tone === "default"
              ? "text-fg-subtle shadow-[inset_0_0_0_1px_var(--color-border-control)]"
              : "text-accent-on/70 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-accent-on)_35%,transparent)]",
          )}
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}
