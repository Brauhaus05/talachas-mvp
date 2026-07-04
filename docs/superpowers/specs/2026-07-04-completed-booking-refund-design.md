# Decision record — Completed-booking refund deferred to Phase 6 admin panel

**Date:** 2026-07-04
**Status:** Decided — refund UI deferred to Phase 6 (admin panel). No code change this session beyond a clarifying comment.
**Related:** HANDOFF.md 4B follow-up "🐛 (OPEN) Refund is unreachable through the UI"; Phase 6 (Reviews loop + admin); deferred "cancellation-policy time windows (refund tiers)".

## The problem (recap)

Phase 4B wired a correct full-refund path — `stripe.refunds.create({ reverse_transfer: true, refund_application_fee: true })`, which claws back the talachero's payout **and** the platform commission — but it is **unreachable through the UI**. It was only exercised via the Stripe CLI during 4B verification.

Two things block a user-facing refund:

1. **No UI control.** A refund is only meaningful *after* capture, and capture happens *only* at completion (`completeBooking`). Completed bookings expose no cancel/refund control: the client dashboard shows only tip presets on completed bookings, and the talachero dashboard doesn't render completed bookings at all (it filters to `pending` + `active`).
2. **The `cancel_booking` RPC rejects `completed`.** It permits only `requested`/`confirmed` and reopens the slot on cancel — wrong for an already-completed, past-dated job. So `cancelBooking`'s `payment_status === 'captured'` branch is **dead code in its current location**.

## Decision

**Defer the refund control to the Phase 6 admin panel.** No self-service (client- or talachero-initiated) refund control ships in the MVP dashboards.

### Why

- A completed-booking refund is inherently a **dispute / goodwill** action. The MVP has no dispute or approval system.
- **Client-initiated** unilateral clawback of a finished job (reversing the talachero's payout with no mediation) is abusable.
- **Talachero-initiated** is safe (they give up their own earnings voluntarily) but adds dashboard surface area for a rare, sensitive action that is better mediated by an operator.
- The Phase 6 admin panel already scopes **users / bookings / disputes / refunds**, which is the natural, mediated home for this. Building a throwaway self-service control now would be wasted work.

Trade-off accepted: until Phase 6, a refund is reachable only via the Stripe API/CLI. This is acceptable because there are no real (non-seed) talacheros yet — the production blocker (MX platform Stripe account) gates real onboarding regardless.

## Groundwork already in place (what Phase 6 reuses)

- **Refund money mechanics are done and verified.** The exact call the admin panel needs:
  ```ts
  stripe.refunds.create({
    payment_intent: <booking.stripe_payment_intent_id>,
    reverse_transfer: true,       // claw back the talachero's payout
    refund_application_fee: true, // return the platform commission
  })
  ```
  This lives (currently unreachable) in `cancelBooking`'s `captured` branch — `src/app/[locale]/dashboard/actions.ts`. **Do not delete it as "dead code"** — it is the reference implementation; a clarifying comment marks it.
- **Webhook is the source of truth.** `charge.refunded` already sets `payment_status='refunded'` and appends a `refund` row to the `transactions` ledger. Booking status stays `completed`; the refund surfaces via the existing `pay_refunded` → `Reembolsado` badge. No `refunded` booking-status enum value is needed.
- **Authorization seam.** `bookings` RLS `participants read their bookings` + admin (`is_admin()`) already lets an admin read any booking; admin writes to money columns go through the service-role client (money columns are `REVOKE UPDATE … FROM authenticated`).

## What Phase 6 must build (admin refund)

1. Admin panel booking view listing completed/captured bookings with a **Refund** action (mediated, with a confirm step).
2. An admin-guarded server action (or admin RPC) that runs the `stripe.refunds.create(...)` above for a chosen booking; the webhook reconciles `payment_status` + ledger.
3. (Optional, with the deferred cancellation-policy work) **partial / tiered** refunds — today's mechanics assume a **full** refund.

## Out of scope (this session)

- Any dashboard refund control (client or talachero).
- Schema changes / migrations.
- Partial / tiered refunds.

## Changes made this session

- This decision record.
- `HANDOFF.md`: refund follow-up folded explicitly into Phase 6 admin scope; note that the reverse-transfer mechanics are ready.
- `src/app/[locale]/dashboard/actions.ts`: clarifying comment on the `captured` refund branch marking it the (currently API-only) reference implementation for the Phase 6 admin refund — not to be removed as dead code.
