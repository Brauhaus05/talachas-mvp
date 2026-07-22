# Talachero Payment-History (Earnings) View — Design

**Date:** 2026-07-22
**Status:** Approved (brainstorming) — ready for implementation plan
**Sprint task:** Sprint 2 · Autoservicio de prestadores — closes the "historial de pagos" gap from "Diseñar panel del prestador"

## Summary

Give a talachero a dedicated page showing **what they've earned** — a summary header
(total net earned, this month, # paid jobs) plus a **per-booking earnings list**, all in
**net** terms (after the platform's 15% commission). Closes the one real gap the panel
audit surfaced: the `transactions` ledger exists but there is no talachero-facing view of
it.

This is an **earnings history**, not a bank-payout-timing view — Stripe handles the actual
deposits to the talachero's bank; the app never records `payout` rows.

**Deferred (own follow-up tasks, not this build):**
- Stripe bank-payout status/timing (would need Stripe Payout API reads).
- Charts, date/status filters, CSV export.

## Context / constraints discovered

- **`transactions`** = immutable append-only ledger (`20260703140003`): `booking_id`,
  `type` (enum `charge | payout | refund | tip`), `amount numeric(12,2)`, `currency`,
  `provider_ref`, `created_at`. **No `talachero_id`** — a talachero's rows are reached via
  `booking_id → bookings.talachero_id`.
- **Amounts are GROSS.** The webhook writes a `charge` row = `pi.amount_received` (the full
  service price the client paid, e.g. CA$560); Stripe deducts the 15% `application_fee`
  on the way to the talachero, so their **net payout = charge × (1 − fee)**. `tip` rows are
  100% theirs; `refund` rows (with `reverse_transfer`) claw the payout back. The `payout`
  enum value is **unused** (no ledger writer emits it).
- **Commission rate** = `getPlatformFeePct()` (`src/lib/stripe/config.ts`, default `0.15`),
  driven by the **server-only** `PLATFORM_FEE_PCT` env (no `NEXT_PUBLIC_`), so the net
  computation must happen **server-side**, not in a client component.
- **`transactions` RLS** (`20260703140004:168`): `participants read booking transactions`
  (`is_booking_participant(booking_id) or is_admin()`) — so a talachero *can* read their own
  bookings' ledger rows. **But the client's name** sits behind `users` own-row RLS, so
  exposing "who paid you" needs a `SECURITY DEFINER` projection — the same reason
  `get_talachero_bookings` / `get_my_bookings` are SECURITY DEFINER. → use an RPC.
- Existing patterns to mirror: `get_talachero_bookings()` (SECURITY DEFINER, self-scopes via
  `auth.uid()` → own `talachero_profiles`, exposes counterparty name + `payment_status`);
  the admin table styling (`admin/disputes/disputes-table.tsx`); dedicated talachero routes
  with a role guard (`/profile`, `/availability`); `formatMoney(amount, locale, currency)`
  from `src/lib/format.ts`. Stat tiles follow the `dataviz` skill.

## Architecture

### 1. Database — new migration `20260722140001_talachero_earnings.sql`

**`get_my_earnings() returns table(...)`** — `SECURITY DEFINER`, `set search_path = public`.
- Resolve the caller's `talachero_profiles.id` via `user_id = auth.uid()`; if none, return no
  rows (defensive — the route role-guards).
- One row **per booking that has ≥1 transaction**, aggregating the ledger:
  `booking_id`, `client_name` (`users.full_name` of the booking's client), `service_slug`,
  `booking_date` (the slot's `start_time`, nullable → fall back to `bookings.created_at`),
  `currency` (from `bookings.currency`), `charge_gross` (`Σ amount filter type='charge'`),
  `tip_total` (`Σ amount filter type='tip'`), `refund_total` (`Σ amount filter type='refund'`),
  `last_activity` (`max(transactions.created_at)`).
- `where b.talachero_id = <mine>` and the booking has transactions (`join`/`group by` over
  `transactions`), `order by last_activity desc`.
- Grant execute to `authenticated` (self-scopes on `auth.uid()`).

Repo conventions: `DROP` then `CREATE` if OUT columns ever change; run `supabase gen types`
after; add a `types.ts` alias only if a stable alias is wanted (not required).

### 2. Data layer — `src/lib/data/talacheros.ts`

`getMyEarnings(): Promise<EarningsView>`:
- Calls `get_my_earnings`, applies `getPlatformFeePct()` **server-side**.
- Per row → `EarningRow`:
  `{ bookingId, clientName, serviceSlug, date, currency, gross, commission, tip, net, refunded }`
  where `refunded = refund_total > 0`,
  `commission = refunded ? 0 : gross × fee`,
  `net = refunded ? tip_total : gross × (1 − fee) + tip_total`.
  (Refund reverses the service charge + fee; tips are separate charges and are shown/kept
  as earned. `commission` shown as a negative in the UI.)
- `summary`:
  - `totalNet` = Σ `net` over all rows.
  - `thisMonthNet` = Σ `net` where `date` falls in the current **CDMX** calendar month.
  - `jobCount` = # rows with `!refunded && gross > 0`.
- Returns `{ rows: EarningRow[]; summary: { totalNet; thisMonthNet; jobCount } }`. Empty
  `rows`/zeroed summary when the caller has no transactions.

### 3. UI — dedicated route

`src/app/[locale]/dashboard/talachero/earnings/page.tsx` (server component):
- Role guard (redirect non-talacheros / signed-out), load `getMyEarnings()`, render the
  summary + table (or an empty state).

Components (server components; no client interactivity needed):
- **`EarningsSummary`** — 3 stat tiles (**Total ganado**, **Este mes**, **Trabajos pagados**),
  built per the `dataviz` skill (grayscale tokens, accessible; money via `formatMoney`).
- **`EarningsTable`** — columns *Fecha · Cliente · Servicio · Monto · Comisión · Propina ·
  Neto · Estado*, reusing the admin-table wrapper styling
  (`overflow-x-auto rounded-lg border`, `scope="col"` headers, `Badge` for status). Refunded
  rows show a **Reembolsado** badge and `net = 0`; others **Pagado**. Money via `formatMoney`;
  `commission` rendered as `−<amount>`. Empty state: a short "Aún no tienes pagos" message.

### 4. Wire-up

- Add a **"Historial de pagos"** card to the talachero dashboard
  (`dashboard/talachero/page.tsx`) linking to `/dashboard/talachero/earnings`, next to the
  profile/availability cards.
- New `earnings` namespace in `messages/{es,en}.json` (in sync, Spanish default): page
  title/subtitle, the 3 tile labels, the column headers, `status_paid`/`status_refunded`,
  empty-state copy, and the dashboard card title/desc.

## Data / rounding notes

- Amounts are stored in **major units** already (the webhook's `minorToMajor` converts Stripe
  minor units before insert), so no unit conversion in the reader.
- `net`/`commission` are derived for **display**; the ledger stays the source of truth
  (immutable). Format with `formatMoney` (0 fraction digits, matching the app). No rounding
  logic beyond the formatter.
- Multi-currency: rows carry their own `currency`; the summary sums assume a single display
  currency (the app is all-CAD today — see the currency section of HANDOFF). If mixed
  currencies ever appear, the summary would need per-currency grouping — **out of scope**
  (noted, not handled).

## Error handling / non-goals

- The reader never throws into the page: an RPC error surfaces as an empty view (log +
  return zeroed). The route role-guards; the RPC self-scopes (a non-talachero gets no rows).
- No writes — this is read-only over the immutable ledger.
- No new npm dependencies. No Stripe API calls (uses the local ledger only).

## Testing / verification

No test runner in this repo. Verification = **typecheck + lint + secretless build clean**,
then:

1. **DB-level (auth-simulation, rolled back):** as a talachero with ledger rows (the earlier
   test data has captured `charge` + `tip` + a `refund`), `get_my_earnings` returns one row
   per booking with correct `charge_gross`/`tip_total`/`refund_total` aggregation, newest
   first; a different talachero sees only their own; a booking with no transactions is
   excluded.
2. **Reader net math:** a `charge_gross = 560` non-refunded row → `commission = 84`,
   `net = 476` (+ tips); a refunded row → `commission = 0`, `net = tip_total`.
3. **Browser pass:** sign in as a seed talachero with earnings → `/dashboard/talachero/earnings`
   shows the summary tiles + list with correct net amounts and Pagado/Reembolsado statuses;
   a fresh talachero shows the empty state; zero console errors.

Use `supabase migration up` (not `db reset`). The migration must reach the cloud via
`supabase db push` before the live site shows earnings.
