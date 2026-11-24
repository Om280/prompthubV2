import { cn } from "@/lib/utils";

/**
 * Keycap hints (DIRECTION-C §3): the text face with tabular figures and a 2px bottom edge, never
 * mono. Hidden under 640px and on touch screens, and hidden from assistive tech (the control's own
 * name says what it does).
 */
export function Kbd({
  keys,
  className,
  tone = "default",
}: {
  keys: string[];
  className?: string;
  tone?: "default" | "on-accent" | "on-graphite";
}) {
  return (
    <span
      className={cn(
        "ih-kbd-group",
        tone === "on-accent" && "ih-kbd-on-accent",
        tone === "on-graphite" && "ih-kbd-on-graphite",
        className,
      )}
      aria-hidden="true"
    >
      {keys.map((k, i) => (
        <kbd key={`${k}-${i}`} className="ih-kbd">
          {k}
        </kbd>
      ))}
    </span>
  );
}
