import { Suspense } from "react";
import { PublicStory } from "@/components/story/public-story";
import { TripSkeleton } from "@/components/trip/trip-view";

export const metadata = { title: "Trip story · Trip Planner", robots: { index: false } };

/** The published story of a trip. Anyone with the trip's share link can read it. */
export default function SharedStoryPage({ params }: PageProps<"/share/[token]/story">) {
  return (
    <Suspense fallback={<TripSkeleton />}>
      <StoryFromParams params={params} />
    </Suspense>
  );
}

async function StoryFromParams({ params }: { params: PageProps<"/share/[token]/story">["params"] }) {
  const { token } = await params;
  return <PublicStory token={token} />;
}
