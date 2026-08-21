import { getTranslations } from "next-intl/server";
import { CheckCircle2, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getMyTalacheroProfile } from "@/lib/data/talacheros";
import { startOnboarding, refreshOnboarding } from "./payment-actions";

/**
 * Stripe Connect onboarding status + controls. A talachero must finish
 * onboarding (charges + payouts enabled) before they can be paid.
 */
export async function PaymentsPanel() {
  const t = await getTranslations("dashboard");
  const profile = await getMyTalacheroProfile();

  const enabled = Boolean(profile?.chargesEnabled && profile?.payoutsEnabled);
  const started = Boolean(profile?.stripeAccountId);

  return (
    <section className="border-border bg-surface-raised flex flex-col gap-4 border p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CreditCard className="text-text-primary h-5 w-5" aria-hidden />
          <h2 className="text-text-primary text-base font-semibold">
            {t("payments_title")}
          </h2>
        </div>
        {enabled ? (
          <Badge>
            <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden />
            {t("payments_active")}
          </Badge>
        ) : started ? (
          <Badge variant="muted">{t("payments_pending")}</Badge>
        ) : null}
      </div>

      <p className="text-text-secondary text-sm">
        {enabled
          ? t("payments_active_desc")
          : started
            ? t("payments_pending_desc")
            : t("payments_intro")}
      </p>

      {!enabled && (
        <div className="flex flex-wrap gap-2">
          <form action={startOnboarding}>
            <Button type="submit" size="sm">
              {started ? t("payments_continue") : t("payments_start")}
            </Button>
          </form>
          {started && (
            <form action={refreshOnboarding}>
              <Button type="submit" size="sm" variant="outline">
                {t("payments_refresh")}
              </Button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
