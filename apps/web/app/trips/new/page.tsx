import { RequireAuth } from "@/components/auth";
import { GenerateTripForm } from "@/components/generate-trip-form";

export const metadata = { title: "Plan with AI · Trip Planner" };

export default function NewTripPage() {
  return (
    <RequireAuth reason="plan">
      <main className="mx-auto w-full max-w-2xl px-4 py-12">
        <GenerateTripForm />
      </main>
    </RequireAuth>
  );
}
