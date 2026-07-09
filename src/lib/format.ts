/**
 * Configured currency for charges and display (ISO 4217, uppercase). Public
 * (`NEXT_PUBLIC_`) because it must be readable in client components and is
 * inherently user-facing — not a secret. Single source for the Stripe charge
 * currency and the money formatter so the two can't drift.
 *
 * Defaults to `CAD`. Overridable via `NEXT_PUBLIC_CURRENCY` (e.g. `USD`, or any
 * ISO 4217 code) — pairs
 * with `STRIPE_CONNECT_COUNTRY`; the Stripe charge currency must match the
 * connected account's region (destination charges + application fees are
 * same-region only).
 */
export function getCurrency(): string {
  return process.env.NEXT_PUBLIC_CURRENCY?.trim().toUpperCase() || "CAD";
}

export function formatMoney(
  amount: number,
  locale: string,
  currency: string = getCurrency()
): string {
  // Pin to en-MX so the currency symbol renders unambiguously as "CA$" in both
  // app locales (es-MX would render "CAD 560"). `locale` is kept for call-site
  // compatibility; it no longer changes the formatted output.
  return new Intl.NumberFormat("en-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
