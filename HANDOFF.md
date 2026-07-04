# Session Handoff — 2026-07-04

> Read alongside [prd.md](./prd.md) and [plan.md](./plan.md). This captures what the code and git log **don't** — session decisions, verification state, and where to pick up.

## Where we are

| Phase | Status |
|---|---|
| **0 — Foundation** | ✅ merged (`f9b0321`) — Next 16, React 19, Tailwind v4, next-intl, CI |
| **1 — Clickable demo (5 Figma screens, mock data)** | ✅ merged (`843107f`) |
| **2 — Data model + Auth** | ✅ merged (PR #1) |
| **3 — Search / profile / booking (real data)** | ✅ merged (PR #2 + #3) — exit criterion met |
| **4A — Stripe Connect onboarding** | ✅ merged (PR #4) — onboarding verified in Stripe test mode |
| **4B — Payments (checkout / capture / refund / tips / ledger)** | ✅ merged (PR #6) + **verified end-to-end in Stripe test mode** (2026-07-04) — fixes in **PR #7 (open)** |

`main` is at `4818c6e` (Phases 0–4B). **PR #7 (`fix/4b-payment-verification`) is open** — the 4B verification fixes (pricing display, refund reversal, env-driven Connect country), an expanded **`CLAUDE.md`** (architecture + workflow onboarding doc, commit `76decd1`), and this handoff; not yet merged. Working tree otherwise clean; the local Supabase stack + seed reproduce everything.

**The core marketplace loop is now real end-to-end:** discover → book (concurrency-safe slot) → pay (Stripe escrow, manual capture) → accept → complete → capture + 15% split → tip → refund, with an immutable `transactions` ledger.

---

## Phase 3 — what shipped (real data behind the Figma screens)

- **`neighborhoods`** table (CDMX colonias, `geography(Point)` centers) + `neighborhood_id` / `jobs_completed` on `talachero_profiles`. Coverage = center point + radius (MVP decision).
- **`SECURITY DEFINER` directory + booking functions** — talachero names, review authors, and the other party in a booking all live behind `users` RLS (own-row only), so curated `SECURITY DEFINER` functions (not views) expose safe projections:
  - `list_talacheros(p_id)`, `get_talachero_reviews(p_id)`
  - `create_booking` (**`SELECT … FOR UPDATE` on the slot → no double-booking**), `respond_to_booking` (accept/reject), `cancel_booking`, `get_my_bookings`, `get_talachero_bookings`
- **`supabase/seed.sql`** — ~10 demo talacheros created as **real auth users** (via the signup trigger), fleshed out with profiles, services, 14 days of availability, and completed bookings + reviews. Written as a **single `DO` block** (temp tables don't survive the seed runner's batching). All demo accounts: password `password123`.
- **UI** — data layer maps RPC rows into the Phase 1 `Talachero` view shape (components unchanged). Real slot picker on the booking form; confirm is a server action calling `create_booking`; client + talachero dashboards list real bookings with cancel / accept / reject.

**Verified end-to-end** (SQL race test + browser): client books a real slot → both dashboards → talachero accepts → confirmed; two clients racing one slot → one wins, one gets `slot_unavailable` cleanly.

## Phase 4A — what shipped (Stripe Connect onboarding)

- Schema: `stripe_account_id` / `charges_enabled` / `payouts_enabled` on profiles; `stripe_payment_intent_id` / `tip_payment_intent_id` / `payment_status` on bookings; `stripe_events` (webhook idempotency). **Money columns are server-only** (`REVOKE UPDATE … FROM authenticated`).
- Lazy server-only Stripe client (apiVersion pinned to the SDK's `2026-06-24.dahlia`) + a service-role Supabase client for trusted Stripe-driven writes.
- Connect Express onboarding (server actions → account + account link → redirect), talachero dashboard **PaymentsPanel**, and a signature-verified idempotent `/api/stripe/webhook` handling `account.updated`.
- **Verified**: onboarding confirmed working in Stripe test mode by the owner.

## Phase 4B — what shipped (payments)

Money model: **15% fee via `PLATFORM_FEE_PCT`, manual capture** (authorize at booking, capture on completion).
- `complete_booking` (talachero: confirmed→completed); `get_my_bookings` / `get_talachero_bookings` recreated with `payment_status`. Applied with `supabase migration up` (non-destructive).
- **`confirmBooking`** gates on the talachero's `charges_enabled`, `create_booking`s, then opens a Stripe **Checkout Session** — `capture_method: manual`, `application_fee_amount` = 15%, `transfer_data.destination` = talachero's Connect account — and redirects the client to pay (30-min expiry releases abandoned slots).
- Actions: reject cancels the hold; cancel cancels-or-refunds; **complete** captures; **tip** is a separate no-fee Checkout to the talachero. Stripe side-effects are best-effort; the **webhook is the source of truth**.
- Webhook writes booking `payment_status` + the `transactions` ledger from `checkout.session.completed`/`expired`, `payment_intent.succeeded`/`canceled`, `charge.refunded`. Idempotent via `stripe_events`.
- UI: talachero "Marcar completada", client tip presets, payment badges, paid/tip banners.
- **Verified without keys**: typecheck/lint/build clean; new dashboard UI renders. **Live charge → capture → ledger / refund / tip need the owner's Stripe test account** — runbook below.

---

## ▶ Verify 4B now (owner, with Stripe test keys)

Prereq: `stripe listen --forward-to localhost:3000/api/stripe/webhook` running; `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` in `.env.local`. **Don't `db reset`** — it wipes the talachero's onboarding.

> **⚠️ Connect region must match your platform account for local testing.** Destination charges + `application_fee_amount` only work when the connected account is in your platform account's region (US/UK/EEA/**CA**/CH — see the blocker below). Onboarding hardcoded `country: "MX"`, which fails against a non-MX platform test account with *"Funds can't be sent to accounts located in MX…"*. Now env-driven via **`STRIPE_CONNECT_COUNTRY`** (`src/lib/stripe/config.ts` → `getConnectCountry()`, default `MX`). Set it to your platform's country in `.env.local` (e.g. `CA`) to test, and clear any stale account first: `update talachero_profiles set stripe_account_id=null, charges_enabled=false, payouts_enabled=false where user_id=(select id from users where email='carlos.mendoza@demo.talachas.mx');`

1. Onboard a talachero (4A): sign in as `carlos.mendoza@demo.talachas.mx` → **Configurar pagos** → finish onboarding → panel **Activos**.
2. As `mariana.ruiz@demo.talachas.mx`, book Carlos → **Confirmar reserva** → pay on Stripe Checkout with test card `4242 4242 4242 4242`.
3. Dashboard shows banner + booking **Pago autorizado**. As Carlos → **Aceptar** → **Marcar completada** (captures).
4. Ledger check: `select type, amount, provider_ref from transactions order by created_at desc;` → expect a `charge` row.
5. Refund: cancel a captured booking → booking **Reembolsado** + a `refund` ledger row. Tip: on a completed booking, tap a preset → Checkout → `tip` ledger row.

### ✅ Verification results (2026-07-04, owner + Claude, Stripe test mode, `STRIPE_CONNECT_COUNTRY=CA`)

End-to-end run in the browser confirmed the ledger/webhook machinery for **every** payment type: onboarding → **Activos**; book → **authorize** (manual-capture hold, no premature charge); accept → **capture** (`charge` row $560, `application_fee.created` $84, `transfer.created` → talachero nets $476); **tip** (`tip` rows); reject/cancel of an authorized booking **voids the hold** (`payment_intent.canceled`); and **refund** (`refund` row, booking → `refunded`, `charge.refunded`). Three real bugs surfaced:

- **🐛 (FIXED) Pricing display + phantom tip.** The booking summary showed the client a **Total = subtotal + 15% fee** ($644) while Stripe correctly charged only the **subtotal** ($560, fee deducted from the talachero's payout). The commission comes out of the talachero's earnings (confirmed decision), so the client total is the subtotal. Also, the summary's tip selector was **never sent to `confirmBooking`** (not in the form) — a client could pick a tip and never be charged it. Fixed: `summary/page.tsx` (`total = subtotal`), `summary/checkout-view.tsx` (removed the dead tip selector + fee-on-top line, added a `checkout.fee_note`), new `fee_note` key in `es`/`en`.
- **🐛 (OPEN) Refund is unreachable through the UI.** `cancelBooking`'s refund branch only fires when `payment_status='captured'`, but capture happens *only* at completion, and **completed bookings expose no cancel control** on either dashboard (client shows tips only; talachero cancel is limited to `confirmed`/`in_progress`). So the refund path is dead code for real users — verified above only by issuing the refund via the Stripe CLI. Needs a "cancel/refund a completed booking" control, best folded into the deferred **cancellation-policy** work below.
- **🐛 (FIXED) Refund didn't reverse the transfer or the fee.** `cancelBooking` called `stripe.refunds.create({ payment_intent })` with no `reverse_transfer` / `refund_application_fee`, so on a captured booking the client was refunded in full but the **talachero kept their payout** and the **platform ate the loss** (−$476). Fixed in `dashboard/actions.ts`: full refunds now set `reverse_transfer: true` + `refund_application_fee: true` (client whole, no party retains funds). **Partial/tiered refunds** per cancellation policy remain TODO (below) — today's fix assumes a full refund.

## What's next (remaining MVP — PRD's 11 in-scope items)

Done (8/11): auth, profiles, KYC (Connect), search/filter, availability slots, booking + concurrency, payments/commission/tips.

| Phase | Scope | Size |
|---|---|---|
| **5 — Chat + notifications** | 1:1 chat per booking (Supabase Realtime), email for key events (Resend), in-app unread badge | 2–3 d |
| **6 — Reviews loop + admin** | post-completion review prompt (schema exists; needs UI + rating-rollup trigger), admin panel (users/bookings/disputes/refunds) | 2–3 d |

**Recommended order:** verify 4B → Phase 5 → Phase 6, slotting the deferred talachero self-service tooling in before onboarding real (non-seed) talacheros.

---

## Stack + decisions confirmed

- Frontend/hosting: Next.js on Vercel · DB/auth/storage/realtime: Supabase · Payments: Stripe Connect
- **KYC**: Connect Express hosted onboarding drives `verification_status` (no separate Stripe Identity for MVP)
- **Coverage area**: center point + radius (not polygon) for MVP
- **Location UX**: neighborhood picker (colonia points + `ST_DWithin`) — **deferred**, lands when a location input appears in search
- **Commission**: 15% via `PLATFORM_FEE_PCT` env
- **Slot granularity**: 1 hour; a booking reserves one slot (`hours` is an informational price estimate)
- **Chat provider (Phase 5)**: default Supabase Realtime

## Still-open / deferred

- **🚨 PRODUCTION BLOCKER — the platform Stripe account must be based in Mexico.** Talachas is a CDMX marketplace collecting a 15% commission (`application_fee_amount`) from MX talacheros via destination charges. Stripe only allows this when the **platform and connected accounts are in the same region**; a foreign platform **cannot** collect application fees from MX connected accounts, and [Stripe says this won't change](https://docs.stripe.com/connect/cross-border-payouts) (cross-border Connect is US/UK/EEA/CA/CH only — MX excluded). The current test platform (`acct_1CQr1k…`, "Brauhaus Studio") is **Canadian**, so real payments to MX talacheros are impossible on it. **Before onboarding any real (non-seed) talachero, provision a Mexico-based platform Stripe account** (MX legal entity + MX bank) and point `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` at it, with `STRIPE_CONNECT_COUNTRY` unset (defaults to `MX`). This is a business/legal decision, not a code change.
- Talachero **onboarding form + availability editor** (profiles/slots are seed-only today; RLS + column grants already allow the owner to edit presentational fields)
- **Neighborhood picker + `ST_DWithin`** search (directory functions are the seam)
- Cancellation-policy **time windows** (refund tiers) — needed for 4B refunds
- Bio is a single DB column serving both locales

---

## Local dev setup

```
open -a Docker
pnpm exec supabase start           # local stack (ports remapped +1000 — see below)
pnpm exec supabase db reset        # apply migrations + seed
# copy API URL + Publishable/Secret keys from `supabase status` into .env.local
pnpm dev                           # :3000
```

- **Ports remapped +1000** (`supabase/config.toml`: api 55321, db 55322, studio 55323…) to coexist with another local Supabase stack that owns the default 543xx ports. `.env.local` points at `:55321`.
- CLI issues **new-format keys** (`sb_publishable_…` / `sb_secret_…`); `@supabase/ssr` accepts the publishable key in the anon slot.
- **No cloud Supabase project linked yet** (`supabase link --project-ref <ref>` when deploying). `.env.local` gitignored; `.env.example` committed.
- Regenerate DB types after any schema change: `pnpm exec supabase gen types typescript --local > src/lib/supabase/database.types.ts` (then `types.ts` re-exports + aliases).

**Commands:** `pnpm dev` · `pnpm build` · `pnpm typecheck` · `pnpm lint` · `pnpm format`

**Design constraints:** grayscale only (tokens, never hex/rgb; state via icon+text). Every visible string through `t()`; both locales in sync (currently 217 keys each).

---

## Gotchas (cumulative)

- **`redirect()` + typed routes** — use `redirect` from `next/navigation` (reliably `never`) with `` `/${locale}/…` as Route ``; next-intl's `redirect` didn't narrow control flow here. External URLs (Stripe) also cast `as Route`.
- **Supabase session + next-intl in one proxy pass** — `proxy.ts` runs next-intl to get a `NextResponse`, then attaches Supabase auth cookies to *that same response*. Don't create a second response.
- **RLS recursion** — a policy on `users` querying `users` recurses; use `SECURITY DEFINER` helpers with a pinned `search_path`.
- **Public projections behind RLS** — display data (talachero name, review author, booking counterparty) sits behind own-row RLS, so it's exposed via `SECURITY DEFINER` functions returning only safe columns, `grant execute … to anon, authenticated`.
- **Seed runner batching** — `supabase db reset` doesn't preserve session temp tables across statement batches; write seeds as one `DO` block. Seed auth users by inserting into `auth.users` (fires the signup trigger) + a matching `auth.identities` row for password login.
- **Concurrency** — `create_booking` locks the slot with `SELECT … FOR UPDATE` before checking status; racing callers serialize and the loser gets `slot_unavailable`.
- **Server-only money writes** — Stripe/verification columns are `REVOKE UPDATE … FROM authenticated`; the webhook + onboarding actions write them via the service-role client. `bookings` UPDATE is fully revoked from `authenticated` (all mutations go through SECURITY DEFINER functions).
- **Lazy env config** — `src/lib/{supabase,stripe}/config.ts` expose getter functions, not module constants, so importing has no side effects and `next build` works with no env (CI). Verify builds with `.env.local` moved aside.
- **Auth-aware nav made pages dynamic** — `TopNavBar` reads the session, so locale pages render on demand (all `ƒ`). Expected tradeoff.
- **Webhook is the source of truth for payments** — actions trigger Stripe (capture/cancel/refund) best-effort inside `safe()`; booking `payment_status` + the `transactions` ledger are written only by the webhook, idempotently (`stripe_events` PK dedupe). Metadata `{ booking_id, kind: 'booking' | 'tip' }` on the PI routes events.
- **`migration up`, not `db reset`, once a talachero is onboarded** — the seed doesn't set Stripe fields, so `db reset` wipes onboarding. Apply new migrations with `supabase migration up --local`; only reset when you deliberately want a clean seed. After a function's return columns change, `DROP` then `CREATE` (CREATE OR REPLACE can't alter OUT columns).
- **Only `charges_enabled` talacheros are bookable-with-payment** — seed talacheros must onboard first; `confirmBooking` returns `talachero_not_payable` otherwise. Search still gates on `verification_status='verified'` (seed sets it), so the directory is unaffected.
- **Prettier drift** — the committed Phase 1 files don't all match current prettier output; `pnpm format` reformats unrelated files. Format only the files you touched, or revert incidental reformats before committing.

---

## What to say to Claude next session

> Continuing Talachas. Phases 0–4B are merged and **4B was verified end-to-end in Stripe test mode** (see "Verification results" above). **PR #7 is open** with the fixes that came out of that run plus a new **`CLAUDE.md`** (start there for a fast architecture read) — review/merge it first. Then bring up the local stack and start **Phase 5 — chat + notifications** (1:1 chat per booking via Supabase Realtime; email via Resend; in-app unread badge). Read `plan.md` §Phase 5 and `prd.md` §6.6 first.

**Before onboarding any real talacheros**, resolve the two 4B follow-ups (both in "Still-open / deferred"): the **🚨 MX platform Stripe account** (production blocker) and the **refund UI** for completed bookings (pairs naturally with the deferred cancellation-policy tiers — the refund reversal is already wired). If you'd rather tackle those, or the deferred **talachero self-service tooling** / **neighborhood `ST_DWithin` search**, before Phase 5, say so.

**Local test note:** `.env.local` currently has `STRIPE_CONNECT_COUNTRY=CA` (workaround so the Canadian test platform can pay connected accounts). Carlos (`carlos.mendoza@demo.talachas.mx`) is onboarded as a **CA** test account and has a completed→refunded booking from this session. `db reset` wipes that onboarding — use `migration up`.
