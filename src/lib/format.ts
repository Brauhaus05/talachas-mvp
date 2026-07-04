/**
 * Configured currency for charges and display (ISO 4217, uppercase). Public
 * (`NEXT_PUBLIC_`) because it must be readable in client components and is
 * inherently user-facing — not a secret. Single source for the Stripe charge
 * currency and the money formatter so the two can't drift.
 *
 * Defaults to `MXN` (production). For local testing against a non-MX platform
 * Stripe account (destination charges + application fees only work same-region),
 * set `NEXT_PUBLIC_CURRENCY=CAD` in `.env.local` — pairs with
 * `STRIPE_CONNECT_COUNTRY`.
 */
export function getCurrency(): string {
  return process.env.NEXT_PUBLIC_CURRENCY?.trim().toUpperCase() || "MXN";
}

export function formatMoney(
  amount: number,
  locale: string,
  currency: string = getCurrency()
): string {
  return new Intl.NumberFormat(locale === "en" ? "en-MX" : "es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
