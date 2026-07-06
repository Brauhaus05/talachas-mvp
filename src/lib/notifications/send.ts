import "server-only";
import { Resend } from "resend";
import { getEmailDevRedirect, getEmailFrom, getResendApiKey } from "./config";

export interface OutboundEmail {
  /** Real intended recipient. May be null (missing user email) → skipped. */
  to: string | null;
  subject: string;
  html: string;
}

/**
 * Best-effort single-recipient send. Never throws — callers (webhook, form
 * actions) must not fail on a notification. No-ops when RESEND_API_KEY is unset
 * or `to` is empty. Applies the dev-redirect rule when EMAIL_DEV_REDIRECT is set.
 */
export async function sendEmail({ to, subject, html }: OutboundEmail): Promise<void> {
  if (!to) return;

  const apiKey = getResendApiKey();
  if (!apiKey) {
    console.warn(`[notifications] RESEND_API_KEY unset — skipping email to ${to}`);
    return;
  }

  const redirect = getEmailDevRedirect();
  const finalTo = redirect ?? to;
  const finalSubject = redirect ? `[→ ${to}] ${subject}` : subject;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: getEmailFrom(),
      to: finalTo,
      subject: finalSubject,
      html,
    });
    if (error) {
      console.error(`[notifications] Resend error for ${to}:`, error);
    }
  } catch (err) {
    console.error(`[notifications] send failed for ${to}:`, err);
  }
}
