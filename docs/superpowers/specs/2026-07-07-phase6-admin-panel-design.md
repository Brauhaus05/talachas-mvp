# Phase 6 cycle 2 — Admin panel design

**Date:** 2026-07-07
**Status:** Approved (brainstorm) — ready for implementation plan.
**Branch (to create):** `feat/phase6-admin-panel`
**Related:** [HANDOFF.md](../../../HANDOFF.md) Phase 6 cycle 2; [reviews-loop design](./2026-07-06-phase6-reviews-loop-design.md) (cycle 1, merged PR #13); [completed-booking refund decision](./2026-07-04-completed-booking-refund-design.md) (force-refund groundwork).

## Goal

Operator tooling at `/dashboard/admin` so a platform admin can moderate the marketplace before real (non-seed) talacheros onboard. **Three features this cycle** (the disputes queue is deferred — it needs a flag mechanism that doesn't exist yet):

1. **Users list + ban/unban**
2. **Bookings list + force-refund** (the deferred completed-booking refund control — mechanics already built in Phase 4B)
3. **Reviews list + delete**

Each reuses existing groundwork: admin RLS is already in place (`is_admin()`), the refund Stripe call is a verified reference impl, and the rating-rollup trigger already handles review DELETE.

## Non-goals (deferred)

- **Disputes queue + flag/report subsystem** → cycle 3 (needs schema + product decisions on who flags what).
- **Partial / tiered refunds** → pairs with the deferred cancellation-policy time windows. This cycle refunds are **full** only.
- Admin **audit log** of moderation actions.
- **Pagination / search / filtering** on the lists (MVP data volume is small).
- Bidirectional or self-service refund controls on the client/talachero dashboards (explicitly rejected in the 2026-07-04 refund decision record).

## Key decisions (from brainstorm)

- **Scope = 3 features**, disputes deferred.
- **Ban = block sign-in entirely** via Supabase's native `auth.users.banned_until` (GoTrue rejects sign-in + token refresh once set), **plus** dropping banned talacheros from the directory and blocking new bookings against them. No new `is_banned` column — ban state lives in `auth.users.banned_until`.
- **Mutation pattern = extend the app's `SECURITY DEFINER` RPC convention** (self-validating `is_admin()`), not broaden service-role usage. The one exception is force-refund, which is a Stripe API call (not a DB write) and therefore a server action, exactly like `cancelBooking`.

## Architecture

### 1. Migration — `supabase/migrations/20260707xxxxxx_admin_panel.sql`

New `SECURITY DEFINER` functions (owner `postgres`, `SET search_path = public`, `grant execute … to authenticated`; each self-gates on `is_admin()`):

- **`admin_set_ban(p_user_id uuid, p_banned bool) returns void`**
  - `is_admin()` else `raise 'not_authorized'`.
  - Target must exist in `public.users` else `raise 'user_not_found'`.
  - Refuse to ban an `admin` (covers self-ban) → `raise 'cannot_ban_admin'`. Unban of a non-admin is always allowed.
  - `update auth.users set banned_until = case when p_banned then 'infinity'::timestamptz else null end where id = p_user_id`.
  - Writing `auth.users` is permitted because the function runs as the definer (`postgres`). GoTrue reads `banned_until` on the password grant and token refresh, so sign-in and session refresh both fail while set. (Existing un-expired JWTs remain valid until their ~1h expiry — acceptable, matches the "session refresh fails" decision.)

- **`admin_delete_review(p_review_id uuid) returns void`**
  - `is_admin()` else `not_authorized`.
  - Row must exist else `review_not_found`.
  - `delete from reviews where id = p_review_id`. The `reviews_rating_rollup` `AFTER DELETE` trigger recomputes `talachero_profiles.rating_avg`/`rating_count` (verified in cycle 1).

- **`admin_list_users() returns table(id uuid, email text, full_name text, role user_role, banned bool)`**
  - `is_admin()` else `not_authorized`.
  - Joins `public.users` → `auth.users` for `banned := (au.banned_until is not null and au.banned_until > now())`. Needed because `authenticated` cannot read the `auth` schema directly, so the ordinary RLS client can't see ban state.

Amend two existing directory/booking functions so a banned talachero is neither listed nor newly bookable (closes the "client pays, no one can accept" trap):

- **`list_talacheros`** — add `and not exists (select 1 from auth.users au where au.id = tp.user_id and au.banned_until is not null and au.banned_until > now())` to the WHERE. (DROP+CREATE only if the OUT columns change — they don't, so `CREATE OR REPLACE`.)
- **`create_booking`** — after resolving the target talachero, reject with a typed `talachero_unavailable` (or reuse an existing suitable code) if that talachero's user is banned. Keep the existing `SELECT … FOR UPDATE` slot logic intact.

> Confirm during implementation whether `create_booking` already has a natural rejection point/code to reuse; prefer reusing an existing typed error over adding a new one if semantics fit.

### 2. Server actions — `src/app/[locale]/dashboard/admin/actions.ts`

- `banUser(userId)` / `unbanUser(userId)` → `supabase.rpc('admin_set_ban', { p_user_id, p_banned })` via the **RLS server client** (admin's own session). Map typed errors to an allowlisted, translatable set (same pattern as `submitReview`). `revalidatePath` the users page.
- `deleteReview(reviewId)` → `supabase.rpc('admin_delete_review', …)`; revalidate the reviews page.
- `forceRefund(bookingId)`:
  - Re-check `getAppUser()?.role === 'admin'` (defense in depth beyond the page guard).
  - Load the booking; require `payment_status === 'captured'` and a `stripe_payment_intent_id`.
  - `safe(() => stripe.refunds.create({ payment_intent, reverse_transfer: true, refund_application_fee: true }))` — the reference impl currently parked in `cancelBooking`'s `captured` branch. Best-effort; the `charge.refunded` webhook flips `payment_status → refunded` and appends the `refund` ledger row (already wired). Revalidate the bookings page.
  - Move/extract the reference refund call so it's shared, not duplicated — remove the "do not delete, reference only" caveat comment from `cancelBooking` once it has a real caller.

### 3. Reads — Server Components via the RLS server client

Admin's existing RLS policies (`is_admin()` in `users`/`bookings`/`reviews`/`transactions` policies) already permit reading all rows, so each sub-page queries directly — **no new read RPCs** except `admin_list_users()` (only because ban state lives in the `auth` schema). Bookings/reviews reads join to `users` for counterparty/author names, which admin's `users` policy allows.

### 4. UI — sub-routes under `/dashboard/admin`

Route-per-view (matches the app's existing convention; replaces the current 3-panel placeholder grid in `admin/page.tsx`):

- **`/dashboard/admin`** — overview: three cards linking to the sections (light landing, not placeholders).
- **`/dashboard/admin/users`** — table: full name, email, role, status (Active / Banned). Row action **Ban** / **Unban** with a confirm step. Admin rows show no ban control.
- **`/dashboard/admin/bookings`** — table filtered to refundable bookings (`payment_status in ('captured')`, i.e. completed+captured): parties, amount, status/payment badge. Row action **Refund** with a confirm step showing the amount to be reversed.
- **`/dashboard/admin/reviews`** — table: author, target talachero, rating (stars), comment, date. Row action **Delete** with a confirm step.

Every page re-runs the `getAppUser()` → `role==='admin'` guard already in `admin/page.tsx` (non-admins bounce to their own dashboard; signed-out → sign-in). Confirm steps are a small client component (button → inline confirm/cancel), since server actions can't prompt. **Design constraints:** grayscale tokens only (never hex/rgb), state via icon+text, every visible string through `t()`, `messages/es.json` + `messages/en.json` kept in sync under a new/extended `admin` namespace.

### 5. Seed admin user

No admin exists; `handle_new_user` forbids self-assigning `admin` at signup. So:
- Add **`admin@talachas.mx`** (password `password123`, `role='admin'`, `locale='es'`) to `supabase/seed.sql` using the same `auth.users` + `auth.identities` insert pattern the seed already uses for demo users, inside the single `DO` block. Fresh `db reset`s then get an admin.
- **This session:** do *not* `db reset` (it re-wipes Stripe onboarding). Create the same admin now via a one-off service-role/SQL insert so the panel is testable immediately.

## Data flow (force-refund, the highest-stakes path)

1. Admin clicks **Refund** on a captured booking → confirm → `forceRefund(bookingId)` server action.
2. Action re-verifies admin + `captured`, calls `stripe.refunds.create({ payment_intent, reverse_transfer: true, refund_application_fee: true })` inside `safe()`.
3. Stripe emits `charge.refunded` → existing webhook sets `payment_status='refunded'`, appends a `refund` row to the immutable `transactions` ledger, idempotent via `stripe_events`.
4. UI reflects `Reembolsado` via the existing `pay_refunded` badge; booking status stays `completed` (no new enum value). Client refund email fires (5B `notifyRefundIssued`, already wired to `charge.refunded`).

The webhook remains the source of truth; the action is best-effort.

## Error handling

- RPC typed errors (`not_authorized`, `user_not_found`, `cannot_ban_admin`, `review_not_found`, `talachero_unavailable`) surface as allowlisted, translatable messages in the actions (mirrors `submitReview`). Unknown codes → a generic "action failed" translation; never leak raw error text.
- Reads degrade defensively: an admin sub-page that fails a query renders an empty-state/error row rather than 500-ing the layout (pattern from the unread-badge RPCs).
- Force-refund tolerates Stripe errors silently (`safe()`), consistent with 4B; the webhook reconciles, and a failed refund leaves state untouched.

## Testing / verification

No test runner → **typecheck + lint + secretless `next build`** clean, plus DB/RPC-level checks runnable headless (the cycle-1 auth-simulation recipe: `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"<uid>","role":"authenticated"}', true)` then call the RPC):

- `admin_set_ban(admin, x, true)` sets `banned_until`; non-admin caller → `not_authorized`; banning an admin → `cannot_ban_admin`; unban clears it.
- `admin_delete_review` removes the row and the rating rolls back (0 drift vs derived).
- `list_talacheros` and `create_booking` exclude / reject a banned talachero.
- `admin_list_users` returns correct `banned` flags.
- Page guards: non-admin session → redirect; signed-out → sign-in.

**Force-refund live path** (Stripe test keys) is an owner runbook, like 4B: ban-free, needs a re-onboarded talachero + a captured booking; verify `charge.refunded` → `refunded` badge + `refund` ledger row + client refund email. The action wiring/guards are verified headless; the live charge→refund is owner-driven.

## File touch list (anticipated)

- `supabase/migrations/20260707xxxxxx_admin_panel.sql` (new)
- `supabase/seed.sql` (add admin user)
- `src/lib/supabase/database.types.ts` regen + `types.ts` aliases
- `src/app/[locale]/dashboard/admin/page.tsx` (overview), `admin/users/page.tsx`, `admin/bookings/page.tsx`, `admin/reviews/page.tsx` (new)
- `src/app/[locale]/dashboard/admin/actions.ts` (new)
- `src/app/[locale]/dashboard/admin/*-table.tsx` + a shared confirm-action client component (new)
- `src/lib/data/` — admin read helpers as needed (map rows → view shapes)
- `src/app/[locale]/dashboard/actions.ts` — extract/share the refund call; drop the "reference only" caveat
- `messages/es.json` + `messages/en.json` — `admin` namespace additions (in sync)
