# Session Handoff — 2026-07-24

> Living session-to-session status: what's live, what's next, and the operational facts the code + git log don't capture. Read alongside [CLAUDE.md](./CLAUDE.md) (architecture), [prd.md](./prd.md), [plan.md](./plan.md).
>
> Per-phase build narratives and per-PR verification logs were trimmed on 2026-07-22 — recover them from git history (`git log -- HANDOFF.md`) or the `docs/superpowers/` specs/plans if needed.

---

## Status at a glance

**The app is DEPLOYED and live** at **https://talachas-mvp.vercel.app** (Stripe **test** mode, seed talacheros). Auto-deploys from `main`.

- **All 11 PRD in-scope features are code-complete and merged** (auth, profiles, KYC/Connect, search, availability, booking+concurrency, payments/commission/tips, chat, email, reviews, admin panel + disputes). Phases 0–6 (cycles 1–3) on `main`.
- **Sprint 2 "Autoservicio de prestadores" is complete and merged:** talachero self-service **profile editor** (#18), **availability editor** (#19), **onboarding with admin-review gate** (#21), **earnings/payment-history view** (#22), and a **manual QA runbook** (#23, `docs/qa/2026-07-22-self-service-provider-qa-runbook.md`). All self-service migrations pushed to cloud.
- **Full Stripe payment chain exercised live** (2026-07-11): onboard → book → authorize (manual-capture hold) → accept → capture → 15% split → ledger, both webhooks delivered to Vercel. Refund/tip mechanics proven in test mode.
- **Live QA pass + E2E payment re-verified (2026-07-24):** full visual audit (client/admin/talachero, desktop + mobile) and a fresh live "reservar y pagar" E2E — book → authorize → accept → capture → 15% ledger split, all correct (Neto CA$476, comisión CA$84). ~15 findings logged to the Notion board (`✅ Tareas`); quick-win fixes + a **mobile nav menu** shipped in **PR #24** (`qa/sprint3-quick-fixes`). Carlos is Stripe-active on the **cloud** DB, so E2E tests can book him directly (no re-onboarding).

The core loop is real end-to-end: discover → book (concurrency-safe slot) → pay (Stripe escrow) → chat → accept → complete → capture + 15% split → tip → refund → review → dispute (admin-mediated), with an immutable `transactions` ledger.

---

## 🚨 Production blocker (business/legal, not code)

**The platform Stripe account must be a Mexico entity before onboarding any real talachero.** Talachas collects a 15% `application_fee_amount` from MX talacheros via destination charges; Stripe only allows this when platform + connected accounts are in the **same region**, and cross-border Connect is **US/UK/EEA/CA/CH only — MX is excluded** ([Stripe won't change this](https://docs.stripe.com/connect/cross-border-payouts)). The current test platform ("Brauhaus Studio", `acct_1CQr1k…`) is **Canadian** — real payouts to MX talacheros are impossible on it.

**Fix:** provision a MX legal entity + MX bank Stripe account, point `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` at it, and unset `STRIPE_CONNECT_COUNTRY` (defaults to `MX`) + `NEXT_PUBLIC_CURRENCY` (the CA/CAD values are test-platform workarounds — see below).

---

## What's next

**Verification / QA:**
- ✅ **Live "reservar y pagar" E2E** (2026-07-24) — re-verified on the deployed site (book → authorize → accept → capture → 15% split; both webhooks delivered). Cloud DB now has one extra test booking (24 jul, Mariana↔Carlos, CA$560 captured).
- ✅ **Browser passes done** (2026-07-24): landing, catálogo, profile, reviews, booking flow, client dashboard, admin (all surfaces), disputes, talachero dashboard/earnings/availability/profile — desktop + mobile. Findings → Notion `✅ Tareas` board; UI fixes in PR #24. Sign-ins: `mariana.ruiz@demo.talachas.mx` (client), `carlos.mendoza@demo.talachas.mx` (talachero), `admin@talachas.mx` (admin) — all `password123`.
- Still owner-run: the **self-service QA runbook** (`docs/qa/2026-07-22-self-service-provider-qa-runbook.md`) — new-talachero signup → onboarding checklist → submit-for-review → admin approve/reject, profile/availability/earnings. Carlos is left `in_review` on the **local** DB to prime the queue (cloud has no pending verifications).

**Small follow-ups (non-blocking, logged from reviews):**
- _PR #24 (2026-07-24) shipped: landing review-count dup, review-card rating display, "Desde ⋯" filter labels, tip-hidden-on-refunded, and the mobile nav menu. Remaining open findings (incl. the two dispute items below) are tracked as rows on the Notion `✅ Tareas` board._
- **Dismissed disputes show the client "Report under review" forever** — `has_dispute` is a boolean; expose `dispute_status` through `get_my_bookings` + a client closed/reviewed state (+ optional email).
- **Admin force-refund (`/admin/bookings`) can leave a dispute stuck `open`** — the two admin surfaces don't reconcile; render a payment-status/date column in the disputes table and/or hide disputes whose booking is already refunded.
- **`verified` no longer implies *payable*** (onboarding decoupled Stripe from verification) — an admin can approve a talachero before Stripe is done, so a listed talachero may return `talachero_not_payable` until they finish Stripe. Accepted "Stripe is parallel" decision; admin queue shows a `payments_ready/pending` badge. Optional tightening: also filter `list_talacheros` on `charges_enabled`.
- Panel task optional extras (owner to close-vs-split): consolidated message inbox, availability date-blocks.
- Dead code cleanup: `PlaceholderPanel` + `dashboard.coming_soon` key (last consumer removed).

**Deferred features:**
- **Cancellation-policy tiers** — partial/tiered refunds so `refundBookingIfCaptured`/`refundCapturedBooking` take an amount (today all refunds are **full**). ~1 day.
- **24h reminder email** — needs a scheduler/cron. Optional dispute acknowledge/dismiss + admin new-dispute-alert emails.
- **Neighborhood picker + `ST_DWithin` search** — directory RPCs (`list_talacheros`) are the seam; lands when a location input appears in search.
- **Photo upload + coverage-zone editor** — deferred from the profile editor (their own tracker rows).

---

## Live deployment — access & config

- **Vercel:** project `talachas-mvp` (scope `brauhaus05s-projects`, `prj_AReXIRBLwKuZuRDMCRNvAlZje2ct`), auto-deploys from `Brauhaus05/talachas-mvp` `main`. Prod alias `talachas-mvp.vercel.app` (== `NEXT_PUBLIC_APP_URL`, so Stripe return/success URLs resolve).
- **Cloud Supabase:** project `talachas-mvp`, ref **`rcpfxcwooptmadyacfkk`** (org `wkuavigarfybmuwlqidp`, East US / N. Virginia). All migrations + seed loaded (10 demo talacheros). Email confirmation **disabled** (immediate session, no SMTP). **DB password lives only in the owner's password manager / Supabase dashboard.**
  - **Cloud schema pushes: `supabase db push`, NEVER `db reset --linked`** (a reset wipes talachero Stripe onboarding). Use the **pooler `--db-url`** (`...pooler.supabase.com...`, us-east-1, session pooler `:5432`) — the direct `db.<ref>` host is IPv6-only and times out on most networks. Owner runs it (password is theirs).
- **Stripe:** TEST mode, Canadian platform account. Webhook **`we_1Ts4wlEkZnbeTZfTVDMMBPbd`** → `https://talachas-mvp.vercel.app/api/stripe/webhook` (6 events: `checkout.session.completed/expired`, `payment_intent.succeeded/canceled`, `charge.refunded`, `account.updated`).
- **Vercel prod env vars (Production scope):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY` (test), `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`, `PLATFORM_FEE_PCT=0.15`, `STRIPE_CONNECT_COUNTRY=CA`, `NEXT_PUBLIC_CURRENCY=CAD`, `RESEND_API_KEY`. (Add Preview/Development if you want branch previews to work.)

### ▶ Simulate a payment on the live site (owner runbook)
Seed talacheros aren't Stripe-onboarded, and `confirmBooking` returns `talachero_not_payable` until `charges_enabled`. So:
1. Sign in as `carlos.mendoza@demo.talachas.mx` → talachero dashboard → **Configurar pagos** → complete Stripe Express **test** onboarding. Panel flips to **Activos** on return.
2. Incognito: sign up a new client (or sign in `mariana.ruiz@demo.talachas.mx`) → open Carlos's profile → pick a slot → **Confirmar reserva** → pay with test card **`4242 4242 4242 4242`** (any future expiry + CVC).
3. Booking shows **Pago autorizado**. Sign in as Carlos → **Aceptar** → **Marcar completada** (captures). Ledger rows land via the webhook.

---

## Local dev setup

```bash
open -a Docker
pnpm exec supabase start           # local stack (ports remapped +1000 — see below)
pnpm exec supabase db reset        # apply migrations + seed (DESTRUCTIVE — see gotcha)
# copy API URL + Publishable/Secret keys from `supabase status` into .env.local
pnpm dev                           # :3000
```

- **Ports remapped +1000** (`config.toml`: api 55321, db 55322, studio 55323) to coexist with another local Supabase stack on the default 543xx ports. `.env.local` points at `:55321` (NOT the `54321` in `.env.example`).
- CLI issues **new-format keys** (`sb_publishable_…` / `sb_secret_…`); `@supabase/ssr` accepts the publishable key in the anon slot.
- `.env.local` has **`STRIPE_CONNECT_COUNTRY=CA` + `NEXT_PUBLIC_CURRENCY=CAD`** (workarounds so the Canadian test platform can charge + pay connected accounts). Unset both for real MX production.
- **Use `migration up`, not `db reset`, once a talachero is onboarded** — the seed doesn't set Stripe fields, so a reset wipes onboarding (`stripe_account_id`, `charges_enabled`). `supabase migration up --local` applies new migrations non-destructively; only reset for a deliberately clean seed.
- After any schema change, regenerate types: `pnpm exec supabase gen types typescript --local > src/lib/supabase/database.types.ts` (then add aliases to the hand-maintained `types.ts`).
- **Seed accounts** (all `password123`): talachero `carlos.mendoza@demo.talachas.mx`, client `mariana.ruiz@demo.talachas.mx`, admin `admin@talachas.mx`. Seed addresses (`*.demo.talachas.mx`) are non-deliverable — set `EMAIL_DEV_REDIRECT` to a real inbox to test email.

**Verification** (no test runner): `pnpm typecheck` + `pnpm lint` + `pnpm build` clean, plus manually exercising flows.
**Design constraints:** grayscale only (tokens, never hex/rgb; state via icon+text). Every visible string through `t()`; keep `messages/es.json` and `messages/en.json` in sync (a `node -e` key diff catches drift). **Prettier drift:** committed Phase 1 files don't match current prettier output — format only files you touched.

---

## Stack + decisions confirmed

- Frontend/hosting: Next.js 16 on Vercel · DB/auth/storage/realtime: Supabase · Payments: Stripe Connect (Express).
- **Currency: app is now all-CAD** — `getCurrency()` defaults to `CAD`, `getConnectCountry()` to `CA` (env overrides still work). `formatMoney` pins the number-locale to `en-MX` so the symbol renders as **`CA$`** in both locales. `NEXT_PUBLIC_CURRENCY` drives both the Stripe charge currency and the display formatter. This is a **currency** change, not a geography rename — CDMX geography (city `country_code='MX'`, `es-MX`, timezone) is unchanged. **CA$/CAD display is intentional until further notice.**
- **KYC:** Connect Express hosted onboarding; **admin approval is now the sole path to `verified`** (Stripe decoupled — the `account.updated` webhook only writes `charges_enabled`/`payouts_enabled`).
- **Commission:** 15% via `PLATFORM_FEE_PCT`.
- **Coverage area:** center point + radius (not polygon) for MVP.
- **Slot granularity:** 1 hour; a booking reserves one slot (`hours` is an informational price estimate).
- **Availability editor model:** "direct slot calendar" — talachero opens/closes concrete 1-hour slots on a 14-day week grid (no recurring templates, no cron).

---

## Gotchas (cumulative)

- **`redirect()` + typed routes** — use `redirect` from `next/navigation` (reliably `never`) with `` `/${locale}/…` as Route ``; external URLs (Stripe) also cast `as Route`.
- **Supabase session + next-intl in one proxy pass** — `proxy.ts` runs next-intl to get a `NextResponse`, then attaches Supabase auth cookies to *that same response*. Don't create a second response.
- **RLS recursion** — a policy on `users` querying `users` recurses; use `SECURITY DEFINER` helpers with a pinned `search_path`. All cross-table state transitions go through `SECURITY DEFINER` RPCs validating `auth.uid()` internally.
- **Public projections behind RLS** — display data (talachero name, review author, booking counterparty) sits behind own-row RLS, exposed via `SECURITY DEFINER` functions returning only safe columns.
- **Server-only money writes** — Stripe/verification/money columns are `REVOKE UPDATE … FROM authenticated`; the webhook + onboarding actions write them via the service-role client. `bookings` UPDATE is fully revoked (all mutations go through RPCs). Changing an RPC's OUT columns needs `DROP` then `CREATE` (not `CREATE OR REPLACE`).
- **Concurrency** — `create_booking` locks the slot with `SELECT … FOR UPDATE` before checking status; racing callers serialize, loser gets `slot_unavailable`. A GiST exclusion constraint makes overlapping slots impossible at the DB level.
- **Webhook is the source of truth for payments** — actions trigger Stripe (capture/cancel/refund) best-effort inside `safe()`; booking `payment_status` + the `transactions` ledger are written only by the webhook, idempotently (`stripe_events` PK dedupe). PI metadata `{ booking_id, kind: 'booking' | 'tip' }` routes events. `transactions` is an append-only immutable ledger — balances are always derived.
- **Lazy env config** — `src/lib/{supabase,stripe}/config.ts` expose getter functions, not module constants, so importing has no side effects and `next build` works with no env (CI). Verify builds with `.env.local` moved aside.
- **Only `charges_enabled` talacheros are bookable-with-payment** — seed talacheros must onboard first; `confirmBooking` returns `talachero_not_payable` otherwise. Directory gates on `verification_status='verified'` (now admin-set), independent of payability.
- **Seed runner batching** — `supabase db reset` doesn't preserve session temp tables across statement batches; write seeds as one `DO` block. Seed auth users via `auth.users` insert (fires the signup trigger) + matching `auth.identities` row.
- **Supabase Realtime (chat)** — a table must be in the `supabase_realtime` publication AND the subscriber must pass its RLS `SELECT`. The channel takes ~1s to reach `SUBSCRIBED`; `ChatView` optimistically appends the sent row (deduped by id) so a message sent in that window isn't lost.
- **Email is best-effort and off-by-default (5B)** — `notify*` swallow all errors (never throw into a form action or the webhook); `sendEmail` no-ops when `RESEND_API_KEY` is unset. Payment "processed" = **capture** (completion), not authorize. `EMAIL_DEV_REDIRECT` is hard-ignored in production. Refund email currently shows the full booking price (correct while all refunds are full — thread `charge.amount_refunded` when partial refunds land).
- **Auth-aware nav made locale pages dynamic** — `TopNavBar` reads the session, so pages render on demand (all `ƒ`). Expected tradeoff.
