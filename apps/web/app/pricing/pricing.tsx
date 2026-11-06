"use client";

import { PricingTable } from "@clerk/nextjs";
import { api } from "@trip/backend/api";
import { useI18n } from "@trip/i18n/react";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { useRefreshSubscription } from "@/components/billing";
import { authEnabled } from "@/components/providers";

/**
 * Clerk's pricing table (checkout runs through Clerk Billing and Stripe). The
 * phone apps send people here to subscribe. Convex re-reads the subscription when
 * the page opens and when the tab regains focus, so returning from checkout
 * unlocks trips without waiting for the webhook.
 */
export function Pricing() {
  const { t } = useI18n();
  const status = useQuery(api.billing.status, {});
  const { refresh, busy } = useRefreshSubscription();

  useEffect(() => {
    if (!authEnabled) return;
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight">{t("billing.pricingTitle")}</h1>
        <p className="mt-2 text-muted-foreground">{t("billing.pricingBody", { max: status?.maxUpcoming ?? 3 })}</p>
      </div>
      {status?.subscribed && status.enforced && (
        <p className="rounded-2xl bg-success/10 px-4 py-3 text-sm font-semibold text-success">✓ {t("billing.active")}</p>
      )}
      {authEnabled ? (
        <PricingTable newSubscriptionRedirectUrl="/pricing" />
      ) : (
        <p className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">{t("nav.demoMode")}</p>
      )}
      {authEnabled && !status?.subscribed && (
        <button onClick={() => void refresh()} disabled={busy} className="self-start text-sm font-semibold text-primary hover:underline disabled:opacity-50">
          {t("billing.checkAgain")}
        </button>
      )}
    </div>
  );
}
