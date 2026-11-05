import type { Id } from "@trip/backend/dataModel";
import { T } from "@trip/i18n/react";
import { Suspense } from "react";
import { RequireAuth } from "@/components/auth";
import { TripView } from "@/components/trip/trip-view";

export default function TripPage({ params }: PageProps<"/trips/[tripId]">) {
  return (
    <RequireAuth>
      <Suspense fallback={<p className="p-8 text-center text-muted-foreground"><T k="common.loadingTrip" /></p>}>
        <TripFromParams params={params} />
      </Suspense>
    </RequireAuth>
  );
}

async function TripFromParams({ params }: { params: PageProps<"/trips/[tripId]">["params"] }) {
  const { tripId } = await params;
  return <TripView tripId={tripId as Id<"trips">} />;
}
