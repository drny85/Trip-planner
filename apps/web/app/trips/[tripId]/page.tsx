import type { Id } from "@trip/backend/dataModel";
import { Suspense } from "react";
import { RequireAuth } from "@/components/auth";
import { TripView } from "@/components/trip/trip-view";

export default function TripPage({ params }: PageProps<"/trips/[tripId]">) {
  return (
    <RequireAuth>
      <Suspense fallback={<p className="p-8 text-center text-muted-foreground">Loading trip…</p>}>
        <TripFromParams params={params} />
      </Suspense>
    </RequireAuth>
  );
}

async function TripFromParams({ params }: { params: PageProps<"/trips/[tripId]">["params"] }) {
  const { tripId } = await params;
  return <TripView tripId={tripId as Id<"trips">} />;
}
