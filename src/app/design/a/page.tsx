import { Suspense } from "react";
import { Studio } from "@/components/design/a/studio";
import { parseState } from "@/components/design/a/data";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function StudioFromParams({ searchParams }: { searchParams: SearchParams }) {
  const { state } = await searchParams;
  return <Studio initialState={parseState(state)} />;
}

export default function DirectionAPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <StudioFromParams searchParams={searchParams} />
    </Suspense>
  );
}
