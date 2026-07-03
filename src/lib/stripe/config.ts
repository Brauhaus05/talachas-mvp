/**
 * Stripe + payment configuration. Lazy getters (not module constants) so
 * importing has no side effects and `next build` works without the secrets
 * present (CI). The checks fire only when a payment path actually runs.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. See .env.example — Stripe test ` +
        `values come from the Stripe Dashboard (test mode).`
    );
  }
  return value;
}

export function getStripeSecretKey(): string {
  return required("STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY);
}

export function getStripeWebhookSecret(): string {
  return required("STRIPE_WEBHOOK_SECRET", process.env.STRIPE_WEBHOOK_SECRET);
}

/** Public base URL for building Stripe return/refresh/success URLs. */
export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/** Platform commission as a fraction (0.15 = 15%). Configurable via env. */
export function getPlatformFeePct(): number {
  const raw = process.env.PLATFORM_FEE_PCT;
  const pct = raw ? Number(raw) : 0.15;
  return Number.isFinite(pct) && pct >= 0 && pct < 1 ? pct : 0.15;
}
