# Disputes ↔ Bookings Reconciliation — Design

**Date:** 2026-08-19
**Status:** Approved (brainstorming) — ready for implementation plan
**Sprint task:** Sprint 3 · Notion `✅ Tareas` rows "Reconciliar disputas ↔ reservas" (P1) and
"Disputa descartada muestra 'Reporte en revisión'…" (P2)

## Summary

Make the two admin surfaces (`/admin/bookings`, `/admin/disputes`) agree about a booking's
payment state, and give the client a terminal state when their report is resolved.

Today a booking refunded from `/admin/bookings` leaves its dispute stuck `open` with a live
"Reembolsar" button that **silently does nothing**, and a dismissed dispute leaves the client
reading "Reporte en revisión" forever.

**Approach chosen (A of 3):** reconcile through the existing `SECURITY DEFINER` RPC layer.
`forceRefund` closes the dispute after a successful refund; `resolveDispute` learns to record
an already-refunded booking instead of bailing. The dispute-resolution RPCs
(`admin_resolve_dispute`, `admin_list_disputes`) are reused **unchanged**; the only signature
change anywhere is `get_my_bookings`, which gains `dispute_status`.

## Corrections to the recorded framing

The HANDOFF note called this a "double-refund risk". **It is not.** Two independent guards
already prevent a double charge:

- `admin_list_bookings` filters `where b.payment_status = 'captured'`, so a refunded booking
  drops off `/admin/bookings` entirely.
- `refundBookingIfCaptured` re-reads the booking and returns early unless it is still
  `captured`; a duplicate Stripe refund would in any case throw into its `catch`.

The real defect is a **state** defect: after an out-of-band refund an open dispute has no
correct terminal state. "Reembolsar" no-ops with no operator feedback, and "Descartar" records
the wrong outcome — telling the client their complaint was rejected when they were refunded.

The client side is **worse than documented**. The whole dispute block is gated on
`paymentStatus === "captured"` (`dashboard/page.tsx:145`), so:

| Dispute resolved as | Client actually sees today |
|---|---|
| `dismissed` | "Reporte en revisión" forever (payment stays `captured`, `has_dispute` stays true) |
| `refunded` | **nothing at all** — payment flips to `refunded`, the gate fails, the block vanishes |

So the refunded case has no confirmation whatsoever, not merely a stale label.

## Context / constraints discovered

- **`disputes`** (`20260707140001`): `booking_id` is `unique` (one dispute per booking,
  dismissal is final by design), `status` is enum `dispute_status` = `open | refunded |
  dismissed`, plus `admin_note`, `resolved_by`, `resolved_at`.
- **`INSERT/UPDATE/DELETE` on `disputes` is revoked from `authenticated`** — every write must
  go through a `SECURITY DEFINER` RPC. This is what rules out writing the row directly from a
  server action (rejected approach B).
- **`admin_resolve_dispute` needs no change.** It already self-gates on `is_admin()`, already
  takes `p_refunded boolean`, and already requires `status = 'open'` — which is exactly the
  guard we want against a race between the two surfaces.
- **`admin_list_disputes` needs no change.** It already selects `b.payment_status` and
  `d.resolved_at`, and `AdminDispute` (`lib/data/admin.ts`) already carries both. The new
  columns are pure UI.
- **`refundBookingIfCaptured` returns a bare `boolean`**, conflating "refund failed, record
  nothing" with "already refunded, nothing to do at Stripe but the dispute should still
  close". That conflation is the mechanical cause of the no-op button.
- **The refund path already emails the client.** `notifyRefundIssued` fires from the
  `charge.refunded` webhook (`api/stripe/webhook/route.ts:194`), so a dispute-resolution email
  on the refund path would double up. Only dismissal needs a new email.
- **`has_dispute` has exactly two consumers** — `lib/data/bookings.ts:52` and the dashboard
  card — both of which this change touches anyway.

## Design

### 1 · Migration — `20260819120001_dispute_reconciliation.sql`

**`get_my_bookings` gains `dispute_status`, drops `has_dispute`.** `DROP` then `CREATE` —
`CREATE OR REPLACE` cannot alter a function's OUT columns (documented gotcha). The existing
`exists (...)` subquery becomes a scalar:

```sql
(select d.status from disputes d where d.booking_id = b.id) as dispute_status
```

`null` when no dispute exists, which is exactly the old `has_dispute = false`. `has_dispute`
is dropped rather than returned alongside — it is precisely `dispute_status is not null`, and
carrying both invites the two drifting apart.

**Backfill.** One `UPDATE` closing every already-reconciled dispute:

```sql
update disputes d
   set status      = 'refunded',
       resolved_at = now(),
       admin_note  = coalesce(d.admin_note, 'Cerrada automáticamente: la reserva ya estaba reembolsada.')
  from bookings b
 where b.id = d.booking_id
   and d.status = 'open'
   and b.payment_status = 'refunded';
```

`resolved_by` is deliberately left `null` — no admin identity decided these, and
`resolved_by IS NULL` is the honest audit marker for a system reconciliation.

### 2 · `refundBookingIfCaptured` → discriminated outcome

`src/lib/stripe/refunds.ts` returns a union instead of `boolean`:

| Outcome | When | Caller behaviour |
|---|---|---|
| `"refunded"` | Stripe refund issued | record dispute `refunded` |
| `"already_refunded"` | `payment_status === "refunded"` | record dispute `refunded` (no Stripe call) |
| `"not_refundable"` | booking missing, not `captured`, or no payment intent | leave dispute `open` |
| `"error"` | Stripe threw | leave dispute `open` |

Splitting `already_refunded` out of the old `false` is the change that unblocks both paths.

### 3 · Server actions — `dashboard/admin/actions.ts`

- **`forceRefund`** — on `"refunded"`, look up an `open` dispute for that booking and call
  `admin_resolve_dispute(p_dispute_id, p_refunded => true)`. Sequenced **after** the refund
  and best-effort, so a dispute-write failure can never strand the money. Revalidates both
  `/dashboard/admin/bookings` and `/dashboard/admin/disputes`.
- **`resolveDispute`** — the refund path records `refunded` on **both** `"refunded"` and
  `"already_refunded"`. `"not_refundable"` and `"error"` keep today's leave-it-open behaviour
  so the operator can retry or dismiss.
- **dismiss path** — additionally fires `notifyDisputeDismissed`.

This also covers refunds issued directly from the Stripe dashboard: the operator sees
`reembolsado` in the new column, and the "Reembolsar" button now correctly closes the dispute
rather than no-opping.

### 4 · Admin UI — payment badge + new columns

Add a shared translated payment-status badge (`admin.payment_<status>` keys) and use it in
**both** admin tables. Both currently render `{b.paymentStatus}` raw, so operators see the
untranslated string `captured` — an open finding on the board that this closes as a side
effect rather than duplicating.

`disputes-table.tsx` gains two columns: **payment status** and **resolved date**
(`resolvedAt`, em-dash when `null`).

### 5 · Client dashboard card — `dashboard/page.tsx`

Remove the `paymentStatus === "captured"` gate around the dispute block; that gate is why a
refunded dispute vanishes. The CTA itself stays gated on `captured` (you can only report a
problem on money that was actually taken).

| `disputeStatus` | Client sees |
|---|---|
| `null` | "Reportar un problema" CTA — only when `captured` |
| `open` | "Reporte en revisión" (unchanged) |
| `refunded` | "Reporte resuelto — reembolsado" |
| `dismissed` | "Reporte revisado" |

`dismissed` is deliberately neutral rather than "cerrado sin reembolso": the UI offers no
appeal path and no reason field, so stating a verdict there would raise questions it cannot
answer.

### 6 · Email — dismissal only

`notifyDisputeDismissed(bookingId)` in `lib/notifications/notify.ts` + a
`disputeDismissedEmail` template, following the established shape exactly: reuses
`getNotificationContext`, wrapped in `try/catch` that only logs, no-ops without
`RESEND_API_KEY`. Fired from the dismiss path of `resolveDispute`.

Not added to the refund path — `notifyRefundIssued` already covers it from the webhook.

## Interfaces changed

| Unit | Change | Consumers |
|---|---|---|
| `get_my_bookings` RPC | `+dispute_status`, `−has_dispute` | `lib/data/bookings.ts` |
| `ClientBooking` | `disputeStatus: DisputeStatus \| null` replaces `hasDispute` | dashboard card |
| `refundBookingIfCaptured` | `boolean` → `RefundOutcome` | `forceRefund`, `resolveDispute` |
| `notify.ts` | `+notifyDisputeDismissed` | `resolveDispute` |

## Out of scope

- **Partial / tiered refunds** — all refunds stay full (existing deferred item).
- **Re-raising a dismissed dispute** — `booking_id` is `unique`; dismissal is final by design.
- **Closing disputes from the `charge.refunded` webhook** (approach C) — the webhook has no
  admin identity for `resolved_by`, and approach A already recovers the Stripe-dashboard case
  through the manual button.
- **An admin "new dispute" alert email** — separate tracker row.

## Verification

No test runner. Verification is:

1. `pnpm typecheck` · `pnpm lint` · `pnpm build` clean.
2. es/en message-key parity (`node -e` key diff).
3. `pnpm exec supabase migration up --local` — **not** `db reset`, which would wipe Carlos's
   Stripe onboarding.
4. Regenerate types: `supabase gen types typescript --local > src/lib/supabase/database.types.ts`,
   then add/adjust aliases in the hand-maintained `types.ts`.
5. Manual flows:
   - raise a dispute → force-refund from `/admin/bookings` → dispute self-closes as
     `reembolsado`, disappears from the open queue, client card reads "resuelto — reembolsado";
   - raise a dispute → refund from Stripe directly → "Reembolsar" in the disputes queue now
     closes it instead of no-opping;
   - raise a dispute → dismiss → client card reads "Reporte revisado", dismissal email sent
     (with `EMAIL_DEV_REDIRECT` set to a real inbox);
   - backfill: confirm any pre-existing stuck rows come out `refunded` after `migration up`.
