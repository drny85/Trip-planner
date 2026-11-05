import { Suspense } from "react";
import { JoinTrip } from "@/components/join-trip";

export const metadata = { title: "Join a trip · Trip Planner", robots: { index: false } };

/** Invite link landing page: shows the trip and a Join button. */
export default function JoinPage({ params }: PageProps<"/join/[token]">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-24 h-96 max-w-lg animate-pulse rounded-3xl bg-muted" />}>
      <JoinFromParams params={params} />
    </Suspense>
  );
}

async function JoinFromParams({ params }: { params: PageProps<"/join/[token]">["params"] }) {
  const { token } = await params;
  return <JoinTrip token={token} />;
}
