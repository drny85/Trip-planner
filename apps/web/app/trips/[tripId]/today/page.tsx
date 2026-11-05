import type { Id } from "@trip/backend/dataModel";
import { Suspense } from "react";
import { RequireAuth } from "@/components/auth";
import { TodayView } from "@/components/today/today-view";

export const metadata = { title: "Today · Trip Planner" };

export default function TodayPage({ params, searchParams }: PageProps<"/trips/[tripId]/today">) {
  return (
    <RequireAuth>
      <Suspense fallback={<p className="p-8 text-center text-muted-foreground">Loading today…</p>}>
        <TodayFromParams params={params} searchParams={searchParams} />
      </Suspense>
    </RequireAuth>
  );
}

async function TodayFromParams({ params, searchParams }: Pick<PageProps<"/trips/[tripId]/today">, "params" | "searchParams">) {
  const [{ tripId }, query] = await Promise.all([params, searchParams]);
  const day = Number(Array.isArray(query.day) ? query.day[0] : query.day);
  return <TodayView tripId={tripId as Id<"trips">} previewDay={Number.isInteger(day) && day > 0 ? day : undefined} />;
}
