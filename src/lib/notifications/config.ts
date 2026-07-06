/**
 * Email (Resend) configuration. Lazy getters (not module constants) so importing
 * has no side effects and `next build` works without the secrets present (CI),
 * matching lib/stripe/config.ts and lib/format.ts.
 */

/** Resend API key. Undefined → sendEmail() no-ops (email-less dev + CI stay green). */
export function getResendApiKey(): string | undefined {
  return process.env.RESEND_API_KEY?.trim() || undefined;
}

/** From address. Fresh Resend accounts may only send from onboarding@resend.dev. */
export function getEmailFrom(): string {
  return process.env.EMAIL_FROM?.trim() || "Talachas <onboarding@resend.dev>";
}

/**
 * Non-prod: when set, ALL outbound mail is redirected to this single inbox, with
 * the real intended recipient shown in the subject. Lets the owner verify every
 * email despite the non-deliverable seed addresses (*.demo.talachas.mx). Unset in
 * production → mail goes to real recipients.
 */
export function getEmailDevRedirect(): string | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  return process.env.EMAIL_DEV_REDIRECT?.trim() || undefined;
}
