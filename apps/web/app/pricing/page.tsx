import { RequireAuth } from "@/components/auth";
import { Pricing } from "./pricing";

export const metadata = { title: "Plans · Trip Planner" };

export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <RequireAuth>
        <Pricing />
      </RequireAuth>
    </main>
  );
}
