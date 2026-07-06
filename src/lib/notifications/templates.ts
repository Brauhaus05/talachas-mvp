import es from "../../../messages/es.json";
import en from "../../../messages/en.json";
import { formatMoney } from "@/lib/format";

const bundles: Record<string, unknown> = { es, en };

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

/** Recipient-locale translator: dot-path lookup + {var} interpolation. */
function makeT(locale: string) {
  const dict = bundles[locale === "en" ? "en" : "es"];
  return (path: string, vars?: Record<string, string | number>): string => {
    const raw = path
      .split(".")
      .reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], dict);
    let s = typeof raw === "string" ? raw : path;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, escapeHtml(String(v)));
    }
    return s;
  };
}

function serviceLabel(locale: string, slug: string): string {
  return makeT(locale)(`services.${slug}.short`);
}

function formatDateTime(locale: string, iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(locale === "en" ? "en-MX" : "es-MX", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function money(locale: string, amount: number | null, currency: string): string {
  return formatMoney(amount ?? 0, locale, currency);
}

/** Grayscale single-column shell. Inline styles only (email clients ignore <style>). */
function layout(locale: string, heading: string, bodyRows: string): string {
  const t = makeT(locale);
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden;">
<tr><td style="padding:20px 24px;border-bottom:1px solid #e4e4e7;font-weight:600;font-size:18px;">Talachas</td></tr>
<tr><td style="padding:24px;">
<h1 style="margin:0 0 16px;font-size:20px;">${heading}</h1>
${bodyRows}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e4e4e7;font-size:12px;color:#71717a;">${t("emails.footer")}</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function row(label: string, value: string): string {
  return `<p style="margin:0 0 8px;font-size:14px;"><span style="color:#71717a;">${label}:</span> <strong>${value}</strong></p>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:14px;line-height:1.5;">${text}</p>`;
}

export interface EmailContent {
  subject: string;
  html: string;
}

export interface BookingFacts {
  serviceSlug: string;
  slotStart: string | null;
  price: number | null;
  currency: string;
}

/** → client, when the talachero accepts. */
export function bookingConfirmedEmail(
  locale: string,
  recipientName: string | null,
  counterpartyName: string | null,
  b: BookingFacts
): EmailContent {
  const t = makeT(locale);
  const body =
    paragraph(t("emails.greeting", { name: recipientName ?? "" })) +
    paragraph(t("emails.booking_confirmed.intro", { talachero: counterpartyName ?? "Talachas" })) +
    row(t("emails.service_label"), serviceLabel(locale, b.serviceSlug)) +
    row(t("emails.when_label"), formatDateTime(locale, b.slotStart)) +
    row(t("emails.booking_confirmed.total_label"), money(locale, b.price, b.currency));
  return { subject: t("emails.booking_confirmed.subject"), html: layout(locale, t("emails.booking_confirmed.heading"), body) };
}

/** → client, on capture (final receipt). */
export function paymentClientEmail(
  locale: string,
  recipientName: string | null,
  counterpartyName: string | null,
  b: BookingFacts
): EmailContent {
  const t = makeT(locale);
  const body =
    paragraph(t("emails.greeting", { name: recipientName ?? "" })) +
    paragraph(t("emails.payment_client.intro", { talachero: counterpartyName ?? "Talachas" })) +
    row(t("emails.service_label"), serviceLabel(locale, b.serviceSlug)) +
    row(t("emails.payment_client.total_label"), money(locale, b.price, b.currency));
  return { subject: t("emails.payment_client.subject"), html: layout(locale, t("emails.payment_client.heading"), body) };
}

/** → talachero, on capture ("you've been paid", net of commission). */
export function paymentTalacheroEmail(
  locale: string,
  recipientName: string | null,
  counterpartyName: string | null,
  b: BookingFacts,
  net: number
): EmailContent {
  const t = makeT(locale);
  const body =
    paragraph(t("emails.greeting", { name: recipientName ?? "" })) +
    paragraph(t("emails.payment_talachero.intro", { client: counterpartyName ?? "" })) +
    row(t("emails.service_label"), serviceLabel(locale, b.serviceSlug)) +
    row(t("emails.payment_talachero.gross_label"), money(locale, b.price, b.currency)) +
    row(t("emails.payment_talachero.net_label"), money(locale, net, b.currency));
  return { subject: t("emails.payment_talachero.subject"), html: layout(locale, t("emails.payment_talachero.heading"), body) };
}

/** → client, on refund. */
export function refundEmail(
  locale: string,
  recipientName: string | null,
  counterpartyName: string | null,
  b: BookingFacts
): EmailContent {
  const t = makeT(locale);
  const body =
    paragraph(t("emails.greeting", { name: recipientName ?? "" })) +
    paragraph(t("emails.refund.intro", { talachero: counterpartyName ?? "Talachas" })) +
    row(t("emails.refund.total_label"), money(locale, b.price, b.currency));
  return { subject: t("emails.refund.subject"), html: layout(locale, t("emails.refund.heading"), body) };
}
