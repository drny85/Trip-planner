import { RequireAuth } from "@/components/auth";
import { TripsList } from "@/components/trips-list";

export const metadata = { title: "My trips · Trip Planner" };

export default function TripsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <RequireAuth>
        <TripsList />
      </RequireAuth>
    </main>
  );
}
