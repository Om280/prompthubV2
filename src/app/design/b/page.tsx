import { Suspense } from "react";
import { Studio } from "@/components/design/b/studio";
import { isPreviewState } from "@/components/design/b/data";

type Search = Promise<Record<string, string | string[] | undefined>>;

async function Preview({ searchParams }: { searchParams: Search }) {
  const raw = (await searchParams).state;
  const state = Array.isArray(raw) ? raw[0] : raw;
  return <Studio key={state ?? "result"} initial={isPreviewState(state) ? state : "result"} />;
}

/** Direction B preview. `?state=` picks the starting state; the switcher at the top changes it. */
export default function DirectionBPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<div style={{ minHeight: "100dvh", background: "#100c1a" }} />}>
      <Preview searchParams={searchParams} />
    </Suspense>
  );
}
