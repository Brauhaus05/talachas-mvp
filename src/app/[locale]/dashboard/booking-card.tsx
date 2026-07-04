import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { formatMxn } from "@/lib/format";
import type { BookingStatus } from "@/lib/supabase/types";

const TZ = "America/Mexico_City";

/**
 * Presentational card for a single booking. Callers pass the appropriate
 * action forms (accept/reject/cancel) as `actions`; the card handles display,
 * status badge, and slot-time formatting.
 */
export async function BookingCard({
  serviceSlug,
  party,
  slotStart,
  status,
  paymentStatus,
  price,
  locale,
  actions,
}: {
  serviceSlug: string;
  party: string;
  slotStart: string | null;
  status: BookingStatus;
  paymentStatus?: string;
  price: number | null;
  locale: string;
  actions?: React.ReactNode;
}) {
  const t = await getTranslations();
  const showPayment = paymentStatus && paymentStatus !== "none";
  const when = slotStart
    ? new Intl.DateTimeFormat(locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: TZ,
      }).format(new Date(slotStart))
    : t("dashboard.booking_no_slot");

  return (
    <div className="border-border bg-surface-raised flex flex-col gap-3 rounded-2xl border p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-text-primary text-sm font-semibold">
          {t(`services.${serviceSlug}.short`)}
        </p>
        <div className="flex items-center gap-2">
          {showPayment && (
            <Badge variant="outline">{t(`dashboard.pay_${paymentStatus}`)}</Badge>
          )}
          <Badge variant="muted">{t(`dashboard.status_${status}`)}</Badge>
        </div>
      </div>
      <p className="text-text-secondary text-sm">{party}</p>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-text-muted">
          {t("dashboard.booking_when")}: {when}
        </span>
        {price != null && (
          <span className="text-text-primary font-medium">
            {formatMxn(price, locale)}
          </span>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2 pt-1">{actions}</div>}
    </div>
  );
}
