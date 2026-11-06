import type { Id } from "@trip/backend/dataModel";
import { T } from "@trip/i18n/react";
import { Suspense } from "react";
import { RequireAuth } from "@/components/auth";
import { BudgetOverviewView } from "@/components/budget/budget-overview";

export const metadata = { title: "Budget · Trip Planner" };

export default function BudgetPage({ params }: PageProps<"/trips/[tripId]/budget">) {
  return (
    <RequireAuth reason="trip">
      <Suspense fallback={<p className="p-8 text-center text-muted-foreground"><T k="common.loadingTrip" /></p>}>
        <BudgetFromParams params={params} />
      </Suspense>
    </RequireAuth>
  );
}

async function BudgetFromParams({ params }: Pick<PageProps<"/trips/[tripId]/budget">, "params">) {
  const { tripId } = await params;
  return <BudgetOverviewView tripId={tripId as Id<"trips">} />;
}
