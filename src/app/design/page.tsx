import Link from "next/link";

const DIRECTIONS = [
  { slug: "a", name: "Direction A", note: "See docs/design/DIRECTION-A.md" },
  { slug: "b", name: "Direction B", note: "See docs/design/DIRECTION-B.md" },
  { slug: "c", name: "Direction C", note: "See docs/design/DIRECTION-C.md" },
];

export default function DesignIndex() {
  return (
    <main style={{ padding: "48px 24px", fontFamily: "system-ui, sans-serif", maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>PromptHub redesign explorations</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Development-only previews. Each route has a state switcher (empty, questions, generating, result, copied,
        history). The working app at / is unchanged.
      </p>
      <ul style={{ display: "grid", gap: 12, listStyle: "none", padding: 0 }}>
        {DIRECTIONS.map((d) => (
          <li key={d.slug}>
            <Link href={`/design/${d.slug}`} style={{ fontSize: 18 }}>
              {d.name}
            </Link>
            <span style={{ color: "#666", marginLeft: 12 }}>{d.note}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
