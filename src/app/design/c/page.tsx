import { Suspense } from "react";
import { DesignC } from "@/components/design/c/design-c";
import { PREVIEW_STATES, type PreviewState } from "@/components/design/c/states";

type Params = Promise<Record<string, string | string[] | undefined>>;

async function WithState({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams;
  const raw = typeof sp.state === "string" ? sp.state : "empty";
  const initial: PreviewState = (PREVIEW_STATES as readonly string[]).includes(raw) ? (raw as PreviewState) : "empty";
  return <DesignC key={initial} initial={initial} />;
}

export default function DirectionCPage({ searchParams }: { searchParams: Params }) {
  return (
    <Suspense fallback={null}>
      <WithState searchParams={searchParams} />
    </Suspense>
  );
}
