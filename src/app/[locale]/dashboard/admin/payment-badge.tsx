import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";

/** The full set allowed by the bookings.payment_status CHECK constraint
 * (20260703170001_stripe_fields.sql:33). */
const KNOWN = ["none", "authorized", "captured", "refunded", "failed"] as const;

function isKnown(status: string): status is (typeof KNOWN)[number] {
  return (KNOWN as readonly string[]).includes(status);
}

/** Translated payment_status chip, shared by the bookings and disputes tables —
 * both previously rendered the raw column, so operators saw the untranslated
 * string "captured". Unknown values fall back to the raw string so a future
 * status degrades visibly instead of throwing on a missing key. */
export async function PaymentBadge({ status }: { status: string }) {
  const t = await getTranslations("admin");
  return (
    <Badge variant="muted">{isKnown(status) ? t(`payment_${status}`) : status}</Badge>
  );
}
