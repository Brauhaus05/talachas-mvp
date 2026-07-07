# Phase 6 cycle 3 — Disputes queue design

**Date:** 2026-07-07
**Status:** Approved (brainstorm) — ready for implementation plan.
**Branch (to create):** `feat/phase6-disputes-queue`
**Related:** [HANDOFF.md](../../../HANDOFF.md) Phase 6 cycle 3; [admin-panel design](./2026-07-07-phase6-admin-panel-design.md) (cycle 2, merged PR #14 — force-refund + `refundCapturedBooking` groundwork); [reviews-loop design](./2026-07-06-phase6-reviews-loop-design.md) (cycle 1 — the `create_review` / `has_review` pattern this mirrors); [completed-booking refund decision](./2026-07-04-completed-booking-refund-design.md) (a completed-booking refund is a mediated dispute action — this cycle is its home).

## Goal

Give a completed booking a **flag → admin queue → resolve** path so a client who had a problem with a finished job can raise it, and an operator can resolve it with a full refund or a dismissal. Cycle 2 already built the resolution mechanics (`forceRefund` + `refundCapturedBooking()`); the flag mechanism and the queue are what's missing. This is the last piece of the deferred "completed-booking refund is a mediated dispute action" decision from 2026-07-04.

## Scope decisions (from brainstorm)

- **Who flags:** **client only**, and only on **completed + captured** bookings. A dispute means "I paid, the job had a problem → I want money back." This lines up exactly with the refund resolution, which only applies to captured payments.
- **Refund granularity:** **full refund or dismiss** — no partial/tiered refunds. Reuses `refundCapturedBooking()` untouched.
- **Notifications:** **none new** this cycle. On a refund resolution the client already receives the existing 5B refund email (fired by the `charge.refunded` webhook). The admin monitors the queue in-app.

## Non-goals (deferred)

- **Talachero- or admin-initiated disputes**, and disputes on non-completed bookings. Client-only, completed-only for MVP.
- **Partial / tiered refunds** → still paired with the deferred cancellation-policy time windows. `refundCapturedBooking()` stays full-refund-only.
- **Dispute-specific emails** — an "acknowledge on flag" email to the client, a "dispute dismissed" note, and a "new dispute" alert to `admin@talachas.mx` are all easy best-effort add-ons via the 5B `notify` module, deferred out of this cycle.
- **Dispute thread / messaging** between parties and admin — the existing per-booking chat already gives parties a channel; the admin reads the reason + booking context. No timeline, no attachments.
- **Re-raising a dismissed dispute** — one dispute per booking, full stop (unique constraint). A dismissed dispute is final for MVP.
- **Pagination / search / filtering** on the queue (MVP data volume is small; matches cycle 2).

## Architecture

### 1. Migration — `supabase/migrations/20260707xxxxxx_disputes.sql`

**Enum + table:**

```sql
create type public.dispute_status as enum ('open', 'refunded', 'dismissed');

create table public.disputes (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null unique references public.bookings(id) on delete cascade,
  raised_by   uuid not null references public.users(id) on delete restrict,
  reason      text not null,
  status      public.dispute_status not null default 'open',
  admin_note  text,
  resolved_by uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index disputes_status_idx on public.disputes (status);
```

Single `status` column (no separate nullable `resolution`): `open` → `refunded` | `dismissed` captures both the state and the outcome. `unique(booking_id)` enforces one dispute per booking.

**RLS + grants:** enable RLS. A client may **read their own** disputes (`raised_by = auth.uid()`) so the dashboard can show status; admin reads via the curated RPC (below). **`INSERT`/`UPDATE`/`DELETE` are revoked from `authenticated`** and no write policy is added — every write goes through a `SECURITY DEFINER` RPC (same posture as `bookings` mutations and `reviews` writes).

**3 RPCs** (owner `postgres`, `security definer`, `set search_path = public`, `grant execute … to authenticated`):

- **`raise_dispute(p_booking_id uuid, p_reason text) returns uuid`** — client action. Validates, in order:
  - Booking exists and `client_id = auth.uid()` else `not_your_booking`.
  - `status = 'completed'` else `booking_not_completed`.
  - `payment_status = 'captured'` else `not_refundable` (no money to refund → a dispute is meaningless in MVP).
  - `btrim(p_reason) <> ''` else `empty_reason`.
  - No existing dispute for the booking else `already_disputed` (belt-and-suspenders with the unique constraint).
  - Inserts `disputes(booking_id, raised_by := auth.uid(), reason := btrim(p_reason), status := 'open')`, returns the new id. Mirrors `create_review`'s structure and typed-error style.

- **`admin_list_disputes() returns table(id uuid, booking_id uuid, client_name text, talachero_name text, price numeric, currency text, payment_status text, reason text, status public.dispute_status, admin_note text, created_at timestamptz, resolved_at timestamptz)`** — `is_admin()` else `not_authorized`. Curated read joining `disputes → bookings → users` (+ `talachero_profiles → users`) for party names + amount + `payment_status`, so the queue renders context. Ordered `open` first, then by `created_at desc`.

- **`admin_resolve_dispute(p_dispute_id uuid, p_refunded boolean, p_note text default null) returns void`** — `is_admin()` else `not_authorized`. Dispute must exist (`dispute_not_found`) and be `status = 'open'` (`dispute_not_open`, so a double-submit or race can't re-resolve). Sets `status := case when p_refunded then 'refunded' else 'dismissed' end`, `resolved_by := auth.uid()`, `resolved_at := now()`, `admin_note := p_note`. **Does not touch the booking or Stripe** — the DB dispute state is the operator's decision; the actual money movement is the server action's Stripe call, reconciled by the webhook (below).

**Extend `get_my_bookings`** — add `has_dispute boolean` (`exists (select 1 from disputes d where d.booking_id = b.id)`) so the client card renders the right CTA state. `CREATE OR REPLACE` can't alter OUT columns → **DROP then CREATE**, re-issue the `grant execute`. Exactly the change cycle 1 made for `has_review`.

### 2. Server actions

**Client — `src/app/[locale]/dashboard/actions.ts`:**
- `raiseDispute(formData)` → reads `bookingId` + `reason`, `supabase.rpc('raise_dispute', …)` via the **RLS server client** (client's own session). Map typed errors to an allowlisted, translatable set (same pattern as `submitReview`). On success `redirect` to the dashboard with `?disputed=1`.

**Admin — `src/app/[locale]/dashboard/admin/actions.ts`:**
- `resolveDispute(formData)` → reads `disputeId` + `action` (`"refund"` | `"dismiss"`):
  - Re-check `getAppUser()?.role === 'admin'` (defense in depth beyond the page guard), mirroring `forceRefund`.
  - If `action === 'refund'`: load the dispute's booking (`stripe_payment_intent_id`, `payment_status`) via the service client; if `captured` + has a PI, `refundCapturedBooking(pi)` inside a `try/catch` (best-effort — the `charge.refunded` webhook flips `payment_status → refunded`, appends the `refund` ledger row, and fires the client refund email, all already wired). Then `rpc('admin_resolve_dispute', { p_dispute_id, p_refunded: true })`.
  - If `action === 'dismiss'`: just `rpc('admin_resolve_dispute', { p_dispute_id, p_refunded: false })`.
  - `revalidatePath` the disputes queue.
  - **Ordering note:** call the RPC after the Stripe call returns (best-effort), so a resolved-refunded dispute reflects that a refund was attempted; the webhook is still the source of truth for `payment_status`. The dispute status is the operator decision, independent of the async money truth (consistent with "webhook is source of truth for payments").

The standalone `admin/bookings` force-refund (`forceRefund`) stays as a no-dispute operator escape hatch; both paths share `refundCapturedBooking()`.

### 3. Reads — data layer

`src/lib/data/admin.ts` — add `listDisputes(): Promise<AdminDispute[]>` mapping `admin_list_disputes` rows (snake_case → camelCase view shape), alongside the existing `listUsers` / `listRefundableBookings` / `listReviews`. `src/lib/data/bookings.ts` — surface `hasDispute` on the client booking view shape (from the new `has_dispute` column), alongside `hasReview`.

### 4. UI

**Client flag** (mirrors the cycle-1 review page):
- `BookingCard` (or the client dashboard's completed-card wiring) shows **"Report a problem"** when the booking is `completed` + `payment_status='captured'` + `!hasDispute`; shows **"Dispute under review"** (disabled/label) when `hasDispute`.
- New route `/dashboard/bookings/[id]/dispute` — server component authorizes via the caller's **own** booking projection (`get_my_bookings`): **404** for non-owner, non-completed, not-captured, or already-disputed. Renders a reason `<textarea>` → `raiseDispute` server action. `?disputed=1` success banner on the dashboard (matches `booked`/`paid`/`tipped`/`reviewed`).

**Admin queue:**
- New route `/dashboard/admin/disputes` — table: parties, amount, reason, status (Open / Refunded / Dismissed via icon+text), date. **Open** rows get **Refund** and **Dismiss** actions, each through the shared confirm-button (`admin/confirm-button.tsx`); the Refund confirm shows the amount to be reversed. Resolved rows show the outcome, no actions.
- `/dashboard/admin` overview — add a fourth card linking to Disputes (with, if cheap, an open-count).
- Every admin page re-runs the `getAppUser()` → `role==='admin'` guard already in `admin/page.tsx`.

**i18n:** new client-facing `disputes` namespace + `admin.disputes` keys in `messages/{es,en}.json`, kept in sync (same key set). Grayscale tokens only, state via icon+text.

### 5. Types / seed

- Regenerate `src/lib/supabase/database.types.ts`; add `Dispute` row + `DisputeStatus` enum aliases to the hand-maintained `types.ts`.
- **Seed** (`supabase/seed.sql`, single `DO` block): insert one **open** dispute on a completed booking so the admin queue renders without Stripe. Because `raise_dispute` requires `payment_status='captured'` (which the seed can't produce without onboarding), the seed inserts the dispute row **directly** (it runs as the seed superuser, not through the RPC) on a booking it also marks `completed` + a stub `payment_status` sufficient for the queue to display. Keep it to one row.
- **This session:** don't `db reset` (re-wipes Stripe onboarding). If a queue row is wanted for a live UI pass, SQL-seed one dispute one-off, matching how cycle 1 primed booking `9a28d83f`.

## Data flow (resolve-with-refund, the highest-stakes path)

1. Client on a completed+captured booking → **Report a problem** → reason → `raiseDispute` → `raise_dispute` RPC inserts an `open` dispute → `?disputed=1`; card flips to "Dispute under review".
2. Admin opens `/dashboard/admin/disputes` → sees the open row with booking context → **Refund** → confirm.
3. `resolveDispute` server action: `refundCapturedBooking(pi)` best-effort, then `admin_resolve_dispute(p_refunded=true)` sets the dispute `refunded`.
4. Stripe emits `charge.refunded` → existing webhook sets booking `payment_status='refunded'`, appends a `refund` row to the immutable `transactions` ledger (idempotent via `stripe_events`), and fires the client refund email (5B). Booking status stays `completed`; the refund surfaces via the existing `pay_refunded` → `Reembolsado` badge.

The webhook remains the source of truth for `payment_status` + the ledger; the dispute row records the operator's decision; the action's Stripe call is best-effort.

## Error handling

- RPC typed errors (`not_your_booking`, `booking_not_completed`, `not_refundable`, `empty_reason`, `already_disputed`, `not_authorized`, `dispute_not_found`, `dispute_not_open`) surface as allowlisted, translatable messages in the actions (mirrors `submitReview` / cycle-2 admin actions). Unknown codes → a generic "action failed" translation; never leak raw error text.
- Admin reads degrade defensively: a failed queue query renders an empty-state/error row rather than 500-ing the layout (pattern from cycle 2 / the unread-badge RPCs).
- `resolveDispute`'s refund tolerates Stripe errors silently (`try/catch`), consistent with 4B/cycle 2; the webhook reconciles, and the dispute is still marked resolved (operator decision recorded). A failed Stripe refund leaves `payment_status` untouched — the operator sees the badge hasn't flipped and can retry via the standalone force-refund.

## Testing / verification

No test runner → **typecheck + lint + secretless `next build`** clean, plus DB/RPC-level checks runnable headless (the cycle-1 auth-simulation recipe: `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"<uid>","role":"authenticated"}', true)` then call the RPC):

- `raise_dispute` happy path inserts an `open` row; all 5 guards return the right typed error: `not_your_booking`, `booking_not_completed`, `not_refundable`, `empty_reason`, `already_disputed`.
- `admin_list_disputes` returns rows with party names + amount for an admin; non-admin caller → `not_authorized`.
- `admin_resolve_dispute`: `open → refunded`, `open → dismissed`, re-resolve of a resolved row → `dispute_not_open`, non-admin → `not_authorized`, unknown id → `dispute_not_found`.
- `get_my_bookings.has_dispute` flips `true` after a dispute is raised.
- Route guards: `/dashboard/admin/disputes` signed-out → **307**; `/dashboard/bookings/[id]/dispute` → **404** for non-owner / non-completed / not-captured / already-disputed.

**Resolve-with-refund live path** (Stripe test keys) is an owner runbook, like cycle 2's force-refund: needs a re-onboarded talachero + a captured booking; verify `charge.refunded` → `refunded` badge + `refund` ledger row + client refund email, and the dispute row → `refunded`. The action wiring/guards are verified headless; the live charge→refund is owner-driven.

## File touch list (anticipated)

- `supabase/migrations/20260707xxxxxx_disputes.sql` (new — enum, table, RLS, revokes, 3 RPCs, `get_my_bookings` DROP+CREATE)
- `supabase/seed.sql` (add one open dispute)
- `src/lib/supabase/database.types.ts` regen + `types.ts` aliases (`Dispute`, `DisputeStatus`)
- `src/app/[locale]/dashboard/actions.ts` — `raiseDispute` client action
- `src/app/[locale]/dashboard/admin/actions.ts` — `resolveDispute` admin action
- `src/app/[locale]/dashboard/bookings/[id]/dispute/page.tsx` + a small dispute form component (new)
- `src/app/[locale]/dashboard/admin/disputes/page.tsx` + `disputes-table.tsx` (new)
- `src/app/[locale]/dashboard/admin/page.tsx` — fourth overview card
- `src/app/[locale]/dashboard/booking-card.tsx` (or the client dashboard card wiring) — "Report a problem" / "Dispute under review" control
- `src/lib/data/admin.ts` — `listDisputes` + `AdminDispute` shape; `src/lib/data/bookings.ts` — `hasDispute`
- `messages/es.json` + `messages/en.json` — `disputes` + `admin.disputes` namespaces (in sync)
