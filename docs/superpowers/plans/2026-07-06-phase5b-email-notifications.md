# Phase 5B — Transactional Email (Resend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send transactional email via Resend for the three reactive lifecycle events that exist today (booking confirmed, payment captured, refund issued → 4 emails), through an inline best-effort `lib/notifications/` seam.

**Architecture:** A self-contained `src/lib/notifications/` module (config · send · context · templates · notify). Business flows call one internally-best-effort `notify*` function per event; a mail failure can never throw into a booking mutation or the Stripe webhook. Copy is localized by the *recipient's* `users.locale` (not request locale — the webhook has none), loaded from the existing message bundles.

**Tech Stack:** Next.js 16 · TypeScript (strict) · Supabase service-role client (recipient contact spans `users` own-row RLS) · Resend SDK · next-intl message bundles (`messages/{es,en}.json`).

**Design spec:** `docs/superpowers/specs/2026-07-06-phase5b-email-notifications-design.md`

**Testing note:** This repo has **no test runner** (CLAUDE.md). "Verification" = `pnpm typecheck` + `pnpm lint` clean per task, `pnpm build` clean before the PR, and one **live email run** at the end. Tasks therefore end with typecheck/lint + commit rather than unit tests; the final task is the live verification.

**Branch:** `feat/phase5b-email-notifications` (already created; the design spec is committed there as `669bd7b`).

---

## File Structure

**New — `src/lib/notifications/`:**
- `config.ts` — lazy env getters: `getResendApiKey()`, `getEmailFrom()`, `getEmailDevRedirect()`.
- `send.ts` — `sendEmail({ to, subject, html })`: Resend delivery + dev-redirect rewrite + no-op when unconfigured.
- `context.ts` — `getNotificationContext(service, bookingId)`: recipients (both parties `{name,email,locale}`) + booking facts.
- `templates.ts` — `makeT(locale)` bundle resolver + 4 pure template builders → `{ subject, html }`.
- `notify.ts` — `notifyBookingConfirmed` / `notifyPaymentCaptured` / `notifyRefundIssued`: internally best-effort orchestration.

**Modified:**
- `src/app/[locale]/dashboard/actions.ts` — `acceptBooking` fires `notifyBookingConfirmed` on success.
- `src/app/api/stripe/webhook/route.ts` — `payment_intent.succeeded` (non-tip) → `notifyPaymentCaptured`; `charge.refunded` → `notifyRefundIssued`.
- `messages/es.json` + `messages/en.json` — new `emails` namespace (kept in sync).
- `.env.example` — three email keys.
- `package.json` / lockfile — `resend` dependency.
- `HANDOFF.md` — 5B status (final task).

---

## Task 1: Dependency, config, and env keys

**Files:**
- Modify: `package.json` (via pnpm)
- Create: `src/lib/notifications/config.ts`
- Modify: `.env.example`

- [ ] **Step 1: Install the Resend SDK**

Run:
```bash
pnpm add resend
```
Expected: `resend` added to `dependencies` in `package.json`, lockfile updated.

- [ ] **Step 2: Create the lazy config module**

Create `src/lib/notifications/config.ts`:
```typescript
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
  return process.env.EMAIL_DEV_REDIRECT?.trim() || undefined;
}
```

- [ ] **Step 3: Document the env keys**

Append to `.env.example`:
```bash

# Email notifications (Resend) — Phase 5B
# Create a key at https://resend.com/api-keys. Unset → emails silently no-op.
RESEND_API_KEY=
# Optional; defaults to "Talachas <onboarding@resend.dev>" (works on a fresh account).
EMAIL_FROM=
# Non-prod only: redirect ALL mail to one inbox (real recipient shown in subject).
# Set to your Resend account owner's email to verify locally against seed data.
EMAIL_DEV_REDIRECT=
```

- [ ] **Step 4: Typecheck + lint**

Run:
```bash
pnpm typecheck && pnpm lint
```
Expected: clean (config.ts is not yet imported anywhere — that's fine).

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/notifications/config.ts .env.example
git commit -m "feat(notifications): add resend dep + lazy email config + env keys"
```

---

## Task 2: The Resend sender (`send.ts`)

**Files:**
- Create: `src/lib/notifications/send.ts`

- [ ] **Step 1: Write the sender**

Create `src/lib/notifications/send.ts`:
```typescript
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
```

- [ ] **Step 2: Typecheck + lint**

Run:
```bash
pnpm typecheck && pnpm lint
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/notifications/send.ts
git commit -m "feat(notifications): resend sender with dev-redirect + unconfigured no-op"
```

---

## Task 3: Email copy (`emails` namespace)

**Files:**
- Modify: `messages/es.json`
- Modify: `messages/en.json`

Both files must carry the **same key set**. Add the `emails` object as a new top-level namespace (alongside `chat`, `dashboard`, etc.). Placeholders use `{name}` style — interpolated by `makeT` in Task 4.

- [ ] **Step 1: Add the `emails` namespace to `messages/es.json`**

Add this top-level key:
```json
"emails": {
  "greeting": "Hola {name},",
  "footer": "Este es un mensaje automático de Talachas. No respondas a este correo.",
  "service_label": "Servicio",
  "when_label": "Fecha y hora",
  "booking_confirmed": {
    "subject": "Tu reserva está confirmada",
    "heading": "Reserva confirmada",
    "intro": "{talachero} confirmó tu reserva. Aquí están los detalles:",
    "total_label": "Total"
  },
  "payment_client": {
    "subject": "Pago completado — recibo",
    "heading": "Pago completado",
    "intro": "Se completó el pago de tu servicio con {talachero}. Gracias por usar Talachas.",
    "total_label": "Total pagado"
  },
  "payment_talachero": {
    "subject": "Recibiste un pago",
    "heading": "Pago recibido",
    "intro": "{client} completó el pago de tu servicio.",
    "gross_label": "Total del servicio",
    "net_label": "Tu pago (después de la comisión)"
  },
  "refund": {
    "subject": "Reembolso procesado",
    "heading": "Reembolso procesado",
    "intro": "Procesamos el reembolso de tu reserva con {talachero}.",
    "total_label": "Monto reembolsado"
  }
}
```

- [ ] **Step 2: Add the matching `emails` namespace to `messages/en.json`**

```json
"emails": {
  "greeting": "Hi {name},",
  "footer": "This is an automated message from Talachas. Please don't reply to this email.",
  "service_label": "Service",
  "when_label": "Date & time",
  "booking_confirmed": {
    "subject": "Your booking is confirmed",
    "heading": "Booking confirmed",
    "intro": "{talachero} confirmed your booking. Here are the details:",
    "total_label": "Total"
  },
  "payment_client": {
    "subject": "Payment complete — receipt",
    "heading": "Payment complete",
    "intro": "Payment for your service with {talachero} is complete. Thanks for using Talachas.",
    "total_label": "Total paid"
  },
  "payment_talachero": {
    "subject": "You've been paid",
    "heading": "Payment received",
    "intro": "{client} completed payment for your service.",
    "gross_label": "Service total",
    "net_label": "Your payout (after commission)"
  },
  "refund": {
    "subject": "Refund processed",
    "heading": "Refund processed",
    "intro": "We've processed the refund for your booking with {talachero}.",
    "total_label": "Amount refunded"
  }
}
```

- [ ] **Step 3: Verify both bundles parse and have identical key sets**

Run:
```bash
node -e "const es=require('./messages/es.json'),en=require('./messages/en.json');const flat=(o,p='')=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==='object'?flat(v,p+k+'.'):[p+k]);const a=new Set(flat(es)),b=new Set(flat(en));const only=(x,y)=>[...x].filter(k=>!y.has(k));console.log('es-only:',only(a,b));console.log('en-only:',only(b,a));"
```
Expected: `es-only: []` and `en-only: []` (no drift).

- [ ] **Step 4: Commit**

```bash
git add messages/es.json messages/en.json
git commit -m "feat(notifications): add emails i18n namespace (es + en)"
```

---

## Task 4: Templates (`templates.ts`)

**Files:**
- Create: `src/lib/notifications/templates.ts`

- [ ] **Step 1: Write the bundle resolver, formatters, layout, and 4 builders**

Create `src/lib/notifications/templates.ts`. `makeT` walks the message bundle by dot-path and interpolates `{var}` placeholders — no next-intl request context needed.

```typescript
import es from "../../../messages/es.json";
import en from "../../../messages/en.json";
import { formatMoney } from "@/lib/format";

const bundles: Record<string, unknown> = { es, en };

/** Recipient-locale translator: dot-path lookup + {var} interpolation. */
function makeT(locale: string) {
  const dict = bundles[locale === "en" ? "en" : "es"];
  return (path: string, vars?: Record<string, string | number>): string => {
    const raw = path
      .split(".")
      .reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], dict);
    let s = typeof raw === "string" ? raw : path;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    }
    return s;
  };
}

function serviceLabel(locale: string, slug: string): string {
  return makeT(locale)(`services.${slug}.short`);
}

function formatDateTime(locale: string, iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(locale === "en" ? "en-MX" : "es-MX", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(iso));
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
  clientName: string | null,
  talacheroName: string | null,
  b: BookingFacts
): EmailContent {
  const t = makeT(locale);
  const body =
    paragraph(t("emails.greeting", { name: clientName ?? "" })) +
    paragraph(t("emails.booking_confirmed.intro", { talachero: talacheroName ?? "Talachas" })) +
    row(t("emails.service_label"), serviceLabel(locale, b.serviceSlug)) +
    row(t("emails.when_label"), formatDateTime(locale, b.slotStart)) +
    row(t("emails.booking_confirmed.total_label"), money(locale, b.price, b.currency));
  return { subject: t("emails.booking_confirmed.subject"), html: layout(locale, t("emails.booking_confirmed.heading"), body) };
}

/** → client, on capture (final receipt). */
export function paymentClientEmail(
  locale: string,
  clientName: string | null,
  talacheroName: string | null,
  b: BookingFacts
): EmailContent {
  const t = makeT(locale);
  const body =
    paragraph(t("emails.greeting", { name: clientName ?? "" })) +
    paragraph(t("emails.payment_client.intro", { talachero: talacheroName ?? "Talachas" })) +
    row(t("emails.service_label"), serviceLabel(locale, b.serviceSlug)) +
    row(t("emails.payment_client.total_label"), money(locale, b.price, b.currency));
  return { subject: t("emails.payment_client.subject"), html: layout(locale, t("emails.payment_client.heading"), body) };
}

/** → talachero, on capture ("you've been paid", net of commission). */
export function paymentTalacheroEmail(
  locale: string,
  talacheroName: string | null,
  clientName: string | null,
  b: BookingFacts,
  net: number
): EmailContent {
  const t = makeT(locale);
  const body =
    paragraph(t("emails.greeting", { name: talacheroName ?? "" })) +
    paragraph(t("emails.payment_talachero.intro", { client: clientName ?? "" })) +
    row(t("emails.service_label"), serviceLabel(locale, b.serviceSlug)) +
    row(t("emails.payment_talachero.gross_label"), money(locale, b.price, b.currency)) +
    row(t("emails.payment_talachero.net_label"), money(locale, net, b.currency));
  return { subject: t("emails.payment_talachero.subject"), html: layout(locale, t("emails.payment_talachero.heading"), body) };
}

/** → client, on refund. */
export function refundEmail(
  locale: string,
  clientName: string | null,
  talacheroName: string | null,
  b: BookingFacts
): EmailContent {
  const t = makeT(locale);
  const body =
    paragraph(t("emails.greeting", { name: clientName ?? "" })) +
    paragraph(t("emails.refund.intro", { talachero: talacheroName ?? "Talachas" })) +
    row(t("emails.refund.total_label"), money(locale, b.price, b.currency));
  return { subject: t("emails.refund.subject"), html: layout(locale, t("emails.refund.heading"), body) };
}
```

- [ ] **Step 2: Typecheck + lint**

Run:
```bash
pnpm typecheck && pnpm lint
```
Expected: clean. If `import es from "../../../messages/es.json"` errors, confirm `resolveJsonModule` is enabled in `tsconfig.json` (Next.js enables it by default) — do NOT change unrelated tsconfig options; if missing, that's a separate finding to raise.

- [ ] **Step 3: Commit**

```bash
git add src/lib/notifications/templates.ts
git commit -m "feat(notifications): localized grayscale email templates"
```

---

## Task 5: Notification context (`context.ts`)

**Files:**
- Create: `src/lib/notifications/context.ts`

Recipient contact (`users.email`, `.locale`, `.full_name`) sits behind own-row `users` RLS, so this reads via the **service-role client**. `talachero_id` on `bookings` references `talachero_profiles(id)`, which has `user_id` → `users`. Sequential queries (not a PostgREST embed) for clarity and to avoid embed-name ambiguity; this is a low-frequency path.

- [ ] **Step 1: Write the context builder**

Create `src/lib/notifications/context.ts`:
```typescript
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { BookingFacts } from "./templates";

type Service = SupabaseClient<Database>;

export interface Party {
  name: string | null;
  email: string | null;
  locale: string;
}

export interface NotificationContext {
  client: Party;
  talachero: Party;
  booking: BookingFacts;
}

/**
 * Assemble everything the email templates need for a booking, via the
 * service-role client (recipient contact spans users own-row RLS). Returns null
 * if the booking or either party can't be resolved — callers no-op on null.
 */
export async function getNotificationContext(
  service: Service,
  bookingId: string
): Promise<NotificationContext | null> {
  const { data: booking } = await service
    .from("bookings")
    .select("client_id, talachero_id, service_category_id, slot_id, price, currency")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return null;

  const [{ data: clientUser }, { data: profile }, { data: category }, slotStart] =
    await Promise.all([
      service
        .from("users")
        .select("full_name, email, locale")
        .eq("id", booking.client_id)
        .maybeSingle(),
      service
        .from("talachero_profiles")
        .select("user_id")
        .eq("id", booking.talachero_id)
        .maybeSingle(),
      service
        .from("service_categories")
        .select("slug")
        .eq("id", booking.service_category_id)
        .maybeSingle(),
      booking.slot_id
        ? service
            .from("availability_slots")
            .select("start_time")
            .eq("id", booking.slot_id)
            .maybeSingle()
            .then((r) => r.data?.start_time ?? null)
        : Promise.resolve(null),
    ]);

  if (!profile) return null;
  const { data: talacheroUser } = await service
    .from("users")
    .select("full_name, email, locale")
    .eq("id", profile.user_id)
    .maybeSingle();

  return {
    client: {
      name: clientUser?.full_name ?? null,
      email: clientUser?.email ?? null,
      locale: clientUser?.locale ?? "es",
    },
    talachero: {
      name: talacheroUser?.full_name ?? null,
      email: talacheroUser?.email ?? null,
      locale: talacheroUser?.locale ?? "es",
    },
    booking: {
      serviceSlug: category?.slug ?? "handyman",
      slotStart,
      price: booking.price,
      currency: booking.currency,
    },
  };
}
```

- [ ] **Step 2: Typecheck + lint**

Run:
```bash
pnpm typecheck && pnpm lint
```
Expected: clean. (Column names are validated against `database.types.ts` by the typed client — a wrong name fails typecheck here, which is the intended safety net.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/notifications/context.ts
git commit -m "feat(notifications): service-role notification context builder"
```

---

## Task 6: Orchestrators (`notify.ts`)

**Files:**
- Create: `src/lib/notifications/notify.ts`

Each function is **internally best-effort** (wraps its body in try/catch, never throws) so no call site needs a wrapper. The talachero payout is computed from `getPlatformFeePct()` to mirror the real Stripe split.

- [ ] **Step 1: Write the three orchestrators**

Create `src/lib/notifications/notify.ts`:
```typescript
import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { getPlatformFeePct } from "@/lib/stripe/config";
import { getNotificationContext } from "./context";
import { sendEmail } from "./send";
import {
  bookingConfirmedEmail,
  paymentClientEmail,
  paymentTalacheroEmail,
  refundEmail,
} from "./templates";

/** → client, when the talachero accepts a request. */
export async function notifyBookingConfirmed(bookingId: string): Promise<void> {
  try {
    const ctx = await getNotificationContext(createServiceClient(), bookingId);
    if (!ctx) return;
    const email = bookingConfirmedEmail(
      ctx.client.locale,
      ctx.client.name,
      ctx.talachero.name,
      ctx.booking
    );
    await sendEmail({ to: ctx.client.email, ...email });
  } catch (err) {
    console.error(`[notifications] notifyBookingConfirmed(${bookingId}) failed:`, err);
  }
}

/** → client (receipt) + talachero (payout), on capture. */
export async function notifyPaymentCaptured(bookingId: string): Promise<void> {
  try {
    const ctx = await getNotificationContext(createServiceClient(), bookingId);
    if (!ctx) return;

    const clientEmail = paymentClientEmail(
      ctx.client.locale,
      ctx.client.name,
      ctx.talachero.name,
      ctx.booking
    );
    const net = Math.round((ctx.booking.price ?? 0) * (1 - getPlatformFeePct()) * 100) / 100;
    const talacheroEmail = paymentTalacheroEmail(
      ctx.talachero.locale,
      ctx.talachero.name,
      ctx.client.name,
      ctx.booking,
      net
    );

    await Promise.all([
      sendEmail({ to: ctx.client.email, ...clientEmail }),
      sendEmail({ to: ctx.talachero.email, ...talacheroEmail }),
    ]);
  } catch (err) {
    console.error(`[notifications] notifyPaymentCaptured(${bookingId}) failed:`, err);
  }
}

/** → client, on refund. */
export async function notifyRefundIssued(bookingId: string): Promise<void> {
  try {
    const ctx = await getNotificationContext(createServiceClient(), bookingId);
    if (!ctx) return;
    const email = refundEmail(
      ctx.client.locale,
      ctx.client.name,
      ctx.talachero.name,
      ctx.booking
    );
    await sendEmail({ to: ctx.client.email, ...email });
  } catch (err) {
    console.error(`[notifications] notifyRefundIssued(${bookingId}) failed:`, err);
  }
}
```

- [ ] **Step 2: Typecheck + lint**

Run:
```bash
pnpm typecheck && pnpm lint
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/notifications/notify.ts
git commit -m "feat(notifications): best-effort event orchestrators (confirmed/captured/refund)"
```

---

## Task 7: Wire the three call sites

**Files:**
- Modify: `src/app/[locale]/dashboard/actions.ts`
- Modify: `src/app/api/stripe/webhook/route.ts`

- [ ] **Step 1: Fire the confirmed email from `acceptBooking`**

In `src/app/[locale]/dashboard/actions.ts`, add the import near the other `@/lib` imports:
```typescript
import { notifyBookingConfirmed } from "@/lib/notifications/notify";
```
Replace the existing `acceptBooking` (currently lines ~43–48) with a version that only notifies on a successful RPC (`respond_to_booking` raises on invalid state → surfaces as `error`):
```typescript
export async function acceptBooking(formData: FormData) {
  const id = String(formData.get("bookingId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_to_booking", {
    p_booking_id: id,
    p_accept: true,
  });
  if (!error) {
    await notifyBookingConfirmed(id);
  }
  await revalidateDashboards(await getLocale());
}
```

- [ ] **Step 2: Fire the payment + refund emails from the webhook**

In `src/app/api/stripe/webhook/route.ts`, add the import near the other imports:
```typescript
import { notifyPaymentCaptured, notifyRefundIssued } from "@/lib/notifications/notify";
```

In the `payment_intent.succeeded` case, **non-tip branch only**, after the `ledger(...)` call for the `"charge"` row (currently ends ~line 150), add `notifyPaymentCaptured` so the block reads:
```typescript
        } else {
          await service
            .from("bookings")
            .update({ payment_status: "captured" })
            .eq("id", bookingId);
          await ledger(
            service,
            bookingId,
            "charge",
            pi.amount_received,
            pi.currency,
            pi.id
          );
          await notifyPaymentCaptured(bookingId);
        }
```

In the `charge.refunded` case, after the `ledger(...)` refund row inside `if (booking)` (currently ends ~line 189), add:
```typescript
          await ledger(
            service,
            booking.id,
            "refund",
            charge.amount_refunded,
            charge.currency,
            charge.id
          );
          await notifyRefundIssued(booking.id);
```

- [ ] **Step 3: Typecheck + lint**

Run:
```bash
pnpm typecheck && pnpm lint
```
Expected: clean.

- [ ] **Step 4: Verify build works WITHOUT secrets (lazy-config guarantee)**

Run:
```bash
mv .env.local .env.local.bak 2>/dev/null; pnpm build; mv .env.local.bak .env.local 2>/dev/null
```
Expected: build succeeds (no email/Stripe/Supabase secrets required at build time). Restore `.env.local` afterward (the command does this).

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/dashboard/actions.ts" src/app/api/stripe/webhook/route.ts
git commit -m "feat(notifications): fire emails on accept, capture, and refund"
```

---

## Task 8: Live verification, HANDOFF, and PR

**Files:**
- Modify: `HANDOFF.md`

- [ ] **Step 1: Prepare the environment**

Ensure `.env.local` has `RESEND_API_KEY` set and `EMAIL_DEV_REDIRECT=<your Resend account owner email>` (e.g. `brauhaus05@gmail.com`). Bring up the stack and Stripe forwarding (from HANDOFF; **never `db reset`** — it wipes Carlos's Stripe onboarding):
```bash
open -a Docker
pnpm exec supabase start
stripe listen --forward-to localhost:3000/api/stripe/webhook
pnpm dev
```

- [ ] **Step 2: Exercise all four emails**

Following the 4B runbook (HANDOFF "Verify 4B"):
1. As `mariana.ruiz@demo.talachas.mx`, book Carlos → pay (`4242 4242 4242 4242`).
2. As `carlos.mendoza@demo.talachas.mx`, **Aceptar** → check the redirect inbox for the **booking-confirmed** email (subject prefixed `[→ mariana.ruiz@…]`).
3. As Carlos, **Marcar completada** (captures) → check for **two** emails: payment receipt (`[→ mariana…]`) and payout (`[→ carlos…]`, net after 15%).
4. Refund via Stripe CLI (completed-booking refund has no self-service UI):
   ```bash
   stripe refunds create --payment-intent <pi_id> --reverse-transfer --refund-application-fee
   ```
   → check for the **refund** email (`[→ mariana…]`).

Expected: 4 emails land in the redirect inbox with correct headings/amounts. Confirm content renders (grayscale card) and the payout email shows a value 15% below the service total.

- [ ] **Step 3: Verify recipient-locale routing**

Set Mariana's locale to English, re-run one event (e.g. book + accept):
```bash
# in Supabase Studio SQL (port 55323) or psql:
update public.users set locale='en' where email='mariana.ruiz@demo.talachas.mx';
```
Expected: Mariana's email arrives in **English** even though Carlos (actor) is Spanish. Revert afterward if desired.

- [ ] **Step 4: Update HANDOFF**

In `HANDOFF.md`: add a **Phase 5B** row to the status table, a short "what shipped" section (4 emails, inline best-effort, recipient-locale, dev-redirect), note the deferred reminder + review emails move to Phase 6, and update the "What to say to Claude next session" pointer. Add a gotcha: *emails are best-effort and only send when `RESEND_API_KEY` is set; seed addresses are non-deliverable so use `EMAIL_DEV_REDIRECT` locally.*

- [ ] **Step 5: Commit + push + open PR**

```bash
git add HANDOFF.md
git commit -m "docs: HANDOFF — Phase 5B email notifications shipped"
git push -u origin feat/phase5b-email-notifications
gh pr create --title "Phase 5B — transactional email (Resend)" --body "$(cat <<'EOF'
Transactional email via Resend for the three reactive lifecycle events:
booking confirmed (→ client), payment captured (→ client + talachero), refund
issued (→ client). Inline best-effort sends through a lib/notifications/ seam;
no event bus, no cron. Recipient-locale i18n; dev-redirect for non-deliverable
seed addresses.

Deferred to Phase 6: 24h reminder (needs cron), new-review email (needs review UI).

Spec: docs/superpowers/specs/2026-07-06-phase5b-email-notifications-design.md
Verified live in Stripe test mode (4 emails + locale routing).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Inline best-effort architecture → Tasks 2, 6 (internally best-effort `notify*`). ✅
- `lib/notifications/` module layout (config/send/context/templates/notify) → Tasks 1–6. ✅
- 3 call sites (accept action + 2 webhook cases) → Task 7. ✅
- Recipient matrix (4 emails; payment=capture; booking-confirmed client-only; refund client-only) → Task 6 orchestrators + Task 4 templates. ✅
- `getNotificationContext` via service-role read → Task 5. ✅
- `emails` namespace, recipient-locale resolution → Tasks 3, 4 (`makeT`). ✅
- Plain HTML templates, `resend` dep → Tasks 4, 1. ✅
- Dev config (`RESEND_API_KEY`/`EMAIL_FROM`/`EMAIL_DEV_REDIRECT`, no-op, redirect) → Tasks 1, 2. ✅
- Idempotency via existing `stripe_events` guard; accept gated on `!error` → Task 7. ✅
- Verification (typecheck/lint/build + live run) → per-task + Task 8. ✅
- Out of scope (reminder, review, notification center, tips) → not built; noted in HANDOFF (Task 8). ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command shows expected output. ✅

**Type consistency:** `BookingFacts` defined in `templates.ts`, imported by `context.ts` and returned in `NotificationContext.booking`; `notify.ts` passes `ctx.booking` straight through. Template builder signatures (`bookingConfirmedEmail`, `paymentClientEmail`, `paymentTalacheroEmail`, `refundEmail`) match their call sites in `notify.ts`. `sendEmail({ to, subject, html })` matches `{ to: ..., ...email }` spreads (where `email` is `{ subject, html }`). `Party.email: string | null` matches `sendEmail`'s `to: string | null`. ✅
