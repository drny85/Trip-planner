import { RequireAuth } from "@/components/auth";
import { TripsList } from "@/components/trips-list";

export const metadata = { title: "My trips · Trip Planner" };

export default function TripsPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12">
      <RequireAuth>
        <TripsList />
      </RequireAuth>
    </main>
  );
}
