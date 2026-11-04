import { Suspense } from "react";
import { SharedTripView, TripSkeleton } from "@/components/trip/trip-view";

export const metadata = { title: "Shared trip · Trip Planner", robots: { index: false } };

/** Public read-only itinerary. No sign-in needed. */
export default function SharedTripPage({ params }: PageProps<"/share/[token]">) {
  return (
    <Suspense fallback={<TripSkeleton />}>
      <SharedFromParams params={params} />
    </Suspense>
  );
}

async function SharedFromParams({ params }: { params: PageProps<"/share/[token]">["params"] }) {
  const { token } = await params;
  return <SharedTripView token={token} />;
}
