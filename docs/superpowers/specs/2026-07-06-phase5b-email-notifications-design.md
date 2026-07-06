# Phase 5B — Transactional Email (Resend) — Design

> **Date:** 2026-07-06 · **Phase:** 5B (second half of Phase 5; 5A chat + unread badge already shipped)
> Read alongside [prd.md](../../../prd.md) §6.6, [plan.md](../../../plan.md) §Phase 5, and [HANDOFF.md](../../../HANDOFF.md).

## Goal

Send transactional email for the lifecycle events that exist in the code **today**, using Resend, without coupling notifications to the business flows. Delivers the whole transactional-email surface currently reachable with **zero new infrastructure** (no cron, no event bus).

## Scope

**In scope — 4 emails across 3 reactive events:**

| Event | Fires at | → Client | → Talachero |
|---|---|---|---|
| Booking confirmed | talachero accepts (`respond_to_booking`) | ✅ "Your booking is confirmed" | — (they triggered it) |
| Payment captured | webhook `payment_intent.succeeded` (non-tip) | ✅ final receipt | ✅ "You've been paid $X" |
| Refund issued | webhook `charge.refunded` | ✅ "You've been refunded" | — |

"Payment processed" is deliberately mapped to **capture** (completion), not authorization. At authorize the client was just on the Stripe Checkout page and already knows they paid; the meaningful "money moved" moment is capture, when the talachero earns and the client gets a final receipt.

**Out of scope — deferred to Phase 6:**
- **24h reminder** — needs a scheduler (cron); no cron infra today, and it's a different (proactive) mechanism from the four reactive sends.
- **New-review email** — no review-submission UI exists yet (Phase 6). Lands there alongside the review trigger.
- **In-app notification center** (`notifications` table) and **event bus** (`events` table + dispatcher) — PRD §6.6 vision, deferred until a second consumer justifies the infra (see Architecture).

## Architecture — Option A: inline best-effort sends

Business flows call **one high-level function per event**; all email specifics live behind that seam. This matches the existing "best-effort side-effect" ethos — the accept action already wraps its Stripe calls in a local `safe()` helper, and the webhook treats its Stripe side-effects as non-fatal (the webhook is the source of truth and must still return 200). No `events` table and no dispatcher are introduced — but the module boundary is drawn cleanly enough that swapping in a real event bus later is a one-file change (`notify.ts`).

**The `notify*` functions are internally best-effort**: each wraps its own body in try/catch, logs on failure, and never throws. This is deliberate — it means no call site needs a `safe()` wrapper (which matters because the webhook has no shared `safe()` helper), and a mail failure can never escape into a booking mutation or the webhook regardless of the caller.

Rationale for A over the PRD's decoupled event bus (§6.1/§6.6): the marketplace has **no second event consumer** yet. Building an `events` table + dispatcher + delivery tracking now is infrastructure ahead of need (YAGNI). The seam preserves the option.

### Module layout

```
src/lib/notifications/
  config.ts      # lazy getters: getResendApiKey(), getEmailFrom(), getEmailDevRedirect()
  send.ts        # sendEmail({to, locale, subject, html}) — Resend + dev-redirect + no-op-if-unconfigured
  context.ts     # getNotificationContext(service, bookingId) -> recipients + booking facts
  templates.ts   # one fn per template -> { subject, html }, localized by recipient locale
  notify.ts      # notifyBookingConfirmed / notifyPaymentCaptured / notifyRefundIssued
```

Each unit has one purpose and a well-defined interface:
- **`config.ts`** — lazy getter functions (never module constants), matching `lib/supabase/config.ts` and `lib/stripe/config.ts`, so importing has no side effects and `next build` succeeds without secrets.
- **`send.ts`** — the only place that talks to Resend. Applies the dev-redirect rule and the unconfigured no-op. Depends on `config.ts` + the `resend` SDK.
- **`context.ts`** — the data seam (see below). Depends on the service-role Supabase client + generated types.
- **`templates.ts`** — pure functions: `(locale, data) -> { subject, html }`. No I/O. Depends only on the message bundles.
- **`notify.ts`** — orchestration: fetch context, render the right template(s), send to the right recipient(s). The **only** surface the business flows import.

## The 3 call sites (only edits to existing flows)

Each is a single `await` — the `notify*` functions are internally best-effort (they never throw), so no per-call-site wrapper is needed:

1. **`src/app/[locale]/dashboard/actions.ts`** — after a successful accept (`respond_to_booking` → `confirmed`): `await notifyBookingConfirmed(bookingId)`.
2. **`src/app/api/stripe/webhook/route.ts`**, `payment_intent.succeeded` case, **non-tip branch only** (after the `captured` update + ledger write): `await notifyPaymentCaptured(bookingId)`.
3. **`src/app/api/stripe/webhook/route.ts`**, `charge.refunded` case (after the booking is marked refunded): `await notifyRefundIssued(bookingId)`.

The tip branch of `payment_intent.succeeded` sends **no** email (tips are out of the 5B matrix).

## Data seam — `getNotificationContext(service, bookingId)`

Both call sites need the **other** party's email/locale/name, which sit behind own-row `users` RLS. A `SECURITY DEFINER` RPC with an `auth.uid()` participant check **cannot** serve the webhook (no `auth.uid()` there), and granting such an RPC to `authenticated` without that check would let any user harvest arbitrary emails. So `getNotificationContext` does a **service-role read** instead:

- The **webhook** already uses the service client throughout — natural fit.
- The **accept action** is given the service client for this read. It is a **trusted read, not a write, keyed by a `booking_id` whose ownership `respond_to_booking` already validated** — no raw user input beyond the id. This is a deliberate, documented narrow use of the service client (the CLAUDE.md guardrail's spirit — "trusted, not driven by raw user input" — holds).

Returns everything a template needs in one call:
```
{
  client:    { name, email, locale },
  talachero: { name, email, locale },
  booking:   { serviceLabel, date, time, amount, currency }
}
```
Amount/currency come from the booking row (display currency is env-driven `NEXT_PUBLIC_CURRENCY`; see HANDOFF Currency section). `email` and `locale` come from each party's `users` row.

## Localization

- New **`emails`** namespace added to **both** `messages/es.json` and `messages/en.json`, kept in sync (same key set — the project's i18n discipline).
- Copy is resolved by the **recipient's own `users.locale`**, not the request locale — required because the webhook has no request context and because the client and talachero may differ in language. Resolution is a **direct message-bundle import keyed by locale** (deterministic, context-free), not next-intl's request-scoped `t()`.
- Consequence: the client can receive Spanish while the talachero receives English on the same event.

## Rendering

- **Plain TS template functions** returning a grayscale, single-column HTML string. No React Email / no render-step dependency — these are simple one-column receipts.
- Templates are pure `(locale, data) -> { subject, html }`; they read localized strings from the resolved bundle and interpolate `context` data.
- The **`resend` SDK** is the one new runtime dependency, used only inside `send.ts` for delivery.

## Dev / test

`config.ts` lazy getters back three env vars:

| Env var | Purpose | Default |
|---|---|---|
| `RESEND_API_KEY` | Resend auth | unset → `sendEmail` no-ops |
| `EMAIL_FROM` | From address | `onboarding@resend.dev` |
| `EMAIL_DEV_REDIRECT` | Non-prod: redirect all mail to one inbox | unset → real recipients |

Behavior:
- **`EMAIL_DEV_REDIRECT` set** (non-prod): every outbound email is sent to that single inbox, with `[→ realrecipient@…]` prepended to the subject so the intended recipient is visible. Lets the owner verify all 4 emails in `brauhaus05@gmail.com` despite the **non-deliverable seed addresses** (`*.demo.talachas.mx`). Unset in production → mail goes to real recipients.
- **`RESEND_API_KEY` unset**: `sendEmail` logs a warning and no-ops. Keeps `next build` / CI and email-less local dev green (consistent with the best-effort ethos and lazy-config pattern).
- All three keys documented in `.env.example`.

The Resend account already exists (owner-provided). On a fresh Resend account, sending is limited to the account owner's own email from `onboarding@resend.dev` until a domain is verified — the dev-redirect inbox must therefore be the Resend account owner's email for local verification.

## Idempotency & failure handling

- **Dedup is already handled** for the two webhook-driven emails: the webhook's `stripe_events` PK guard processes each Stripe event exactly once, so capture/refund emails send once even across Stripe retries. The booking-confirmed email sends only on a **successful** `respond_to_booking` (a double-accept is rejected by the RPC, so no duplicate).
- **All sends are best-effort inside the `notify*` functions** — each function swallows and logs its own failures and never throws, so a delivery error can't escape into a form action or the webhook (which must still return 200 so Stripe doesn't retry indefinitely). `send.ts` also no-ops when `RESEND_API_KEY` is unset.

## Verification (no test runner)

1. `pnpm typecheck` + `pnpm lint` + `pnpm build` clean (build verified with `.env.local` moved aside to confirm lazy config).
2. Live run with `EMAIL_DEV_REDIRECT=brauhaus05@gmail.com` and Resend key set:
   - Bring up the local stack (`pnpm exec supabase start`; **never `db reset`** — it wipes Carlos's onboarding).
   - `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
   - Book (Mariana → Carlos) → **accept** (Carlos): confirm the **booking-confirmed** email to the client inbox.
   - Complete (capture): confirm **payment-captured** emails to **both** client and talachero (redirected inbox shows both, tagged with each real recipient).
   - Refund (Stripe CLI, per the 4B runbook — completed-booking refund has no self-service UI): confirm **refund** email to the client.
   - Verify locale correctness: temporarily set a recipient's `users.locale` and confirm the email language follows the recipient, not the actor.

## Files touched

**New:** `src/lib/notifications/{config,send,context,templates,notify}.ts`; spec + plan docs.
**Edited:** `src/app/[locale]/dashboard/actions.ts` (1 call), `src/app/api/stripe/webhook/route.ts` (2 calls), `messages/es.json` + `messages/en.json` (`emails` namespace), `.env.example` (3 keys), `package.json` (`resend` dep).

## Non-goals / explicitly deferred

- 24h reminder (cron) → Phase 6.
- New-review email → Phase 6 (needs review UI).
- In-app notification center + `events`/`notifications` tables + event-bus dispatcher → deferred until a second consumer exists; the `notify.ts` seam preserves the migration path.
- Tip emails — not in the agreed recipient matrix.
- SMS / push — out of MVP scope (PRD §4).
