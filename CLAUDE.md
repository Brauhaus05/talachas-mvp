# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

**Talachas** — a CDMX (Mexico City) two-sided marketplace connecting clients with *talacheros* (on-demand handymen / service providers). Clients browse a directory, book a time slot, and pay through Stripe; the platform takes a 15% commission via Stripe Connect. Bilingual (Spanish default, English), payments-critical, RLS-enforced.

Stack: Next.js 16 (App Router) · React 19 · next-intl · Supabase (Postgres + Auth + RLS + PostGIS) · Stripe Connect (Express) · Tailwind v4 · TypeScript (strict) · pnpm.

## Commands

```bash
pnpm dev            # dev server on :3000
pnpm build          # production build (works without secrets — see "lazy config" below)
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm format         # prettier --write . (see prettier-drift gotcha)

pnpm exec supabase start           # local stack — ports remapped +1000 (API :55321, db :55322, studio :55323)
pnpm exec supabase db reset        # apply all migrations + seed (DESTRUCTIVE — see below)
pnpm exec supabase migration up --local   # apply NEW migrations only, non-destructive
pnpm exec supabase status          # prints local API URL + anon/service keys → copy into .env.local

# After ANY schema change, regenerate DB types:
pnpm exec supabase gen types typescript --local > src/lib/supabase/database.types.ts

# Stripe webhooks in local dev:
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

There is no test runner. "Verification" means typecheck + lint + build clean, plus manually exercising flows. Seed accounts (`supabase/seed.sql`) are real auth users; all use password `password123`.

**Use `migration up`, not `db reset`, once a talachero has onboarded to Stripe** — the seed doesn't set Stripe fields, so a reset wipes onboarding state (`stripe_account_id`, `charges_enabled`). Only reset when you deliberately want a clean seed.

## Architecture

### Request pipeline: `src/proxy.ts` (NOT `middleware.ts`)

Next.js 16 renames the middleware entrypoint to `proxy.ts`. It runs three things per request, in order:
1. **next-intl routing** — resolves the locale (may redirect `/` → `/es`); every route is locale-prefixed (`localePrefix: "always"`).
2. **Supabase session refresh** — `updateSession` (`src/lib/supabase/middleware.ts`) revalidates the JWT and writes rotated auth cookies *onto the same response* next-intl built. Attaching cookies to the existing response is what lets auth + i18n coexist in one pass.
3. **Optimistic route guards** — bounces signed-out users off `/dashboard/*` and signed-in users off `/auth/*`. This is optimistic only; the **authoritative** role check lives in each dashboard's server layout via `getAppUser()`.

### i18n

Locales `["es", "en"]`, default `es`, always prefixed. Config in `src/i18n/routing.ts`; server request config in `src/i18n/request.ts`; navigation helpers in `src/i18n/navigation.ts`. Copy lives in `messages/es.json` and `messages/en.json` — keep both in sync. All pages live under `src/app/[locale]/`.

### Supabase clients — four, with distinct trust levels

- **`lib/supabase/server.ts`** — per-request SSR client for Server Components / Actions / Route Handlers. **Enforces RLS.** Never cache or share across requests. Default for anything acting on behalf of a user.
- **`lib/supabase/service.ts`** — service-role client. **Bypasses RLS.** `server-only`. Use ONLY for trusted writes not driven by raw user input: Stripe onboarding + webhook writes to money/verification columns.
- **`lib/supabase/middleware.ts`** — session-refresh client used only by the proxy.
- **`lib/supabase/client.ts`** — browser client.

Connection config (`lib/supabase/config.ts`) and Stripe config (`lib/stripe/config.ts`) use **lazy getter functions, not module constants**, so importing has no side effects and `next build` succeeds without secrets present. Missing-env errors fire only when a client/payment path actually runs.

### Auth & roles

Roles: `client` | `talachero` | `admin` (Postgres enum). `getAppUser()` (`lib/auth.ts`) is the authoritative "who's signed in" check — joins the validated auth user to their `public.users` row for the role. `dashboardPathForRole()` maps role → dashboard path. `admin` can never be self-assigned at signup (enforced in the `handle_new_user` trigger).

### Database: RLS + SECURITY DEFINER RPCs

Migrations in `supabase/migrations/` (timestamped). The model:

- **All cross-table state transitions go through `SECURITY DEFINER` Postgres functions**, each validating `auth.uid()` internally: `create_booking`, `respond_to_booking`, `cancel_booking`, `complete_booking` (writes), and `list_talacheros`, `get_talachero_reviews`, `get_my_bookings`, `get_talachero_bookings` (reads). The app calls these via `supabase.rpc(...)` — see `lib/data/`.
- **`bookings` UPDATE is fully revoked from `authenticated`** — every booking mutation must go through an RPC. Stripe/verification/money columns are also `REVOKE UPDATE`, written only by the service-role client.
- **`transactions` is an append-only immutable ledger** (PRD §6.4) — no `updated_at`; UPDATE/DELETE revoked. Balances are always derived, never stored.
- **Slot concurrency** is handled two ways: a GiST exclusion constraint makes overlapping slots for one talachero impossible at the DB level, and `create_booking` does `SELECT ... FOR UPDATE` on the slot row so two clients racing the same slot serialize (loser gets `slot_unavailable`).
- PostGIS is enabled (`extensions` schema) for coverage-area / radius matching (center point + radius).

`lib/data/` is the data-access layer: it calls the RPCs and maps snake_case DB rows into the camelCase view shapes the UI components already consume (types mirror the Phase 1 mock shapes in `lib/mock/`).

### DB types

`database.types.ts` is **generated** (overwritten wholesale by `gen types`). `types.ts` is **hand-maintained** — it re-exports `Database` plus stable enum/row aliases. Import from `types.ts`, not the generated file; add new aliases there after a schema change.

### Payments (Stripe Connect, the highest-stakes area)

Onboarding: talacheros complete **Stripe Connect Express** onboarding (`dashboard/talachero/payment-actions.ts`). A talachero is only bookable-with-payment once `charges_enabled` is true; otherwise `confirmBooking` returns `talachero_not_payable`.

Booking money flow:
1. `confirmBooking` (`book/[talacheroId]/summary/actions.ts`) → `create_booking` RPC reserves the slot → opens a Stripe **Checkout Session** with **manual capture** (funds authorized, not captured), a 15% `application_fee_amount`, and `transfer_data.destination` = the talachero's Connect account.
2. `checkout.session.completed` webhook flips `payment_status` → `authorized`. Abandoned sessions expire → `checkout.session.expired` releases the slot.
3. Talachero marks done → `completeBooking` → `complete_booking` RPC → **captures** the PaymentIntent → `payment_intent.succeeded` webhook flips to `captured` and writes the ledger.
4. Cancellation refunds with `reverse_transfer: true` + `refund_application_fee: true` (claws back payout + commission). Reject before capture cancels the authorization hold.
5. Tips are a **separate charge with no platform fee**, transferred entirely to the talachero.

The **webhook (`app/api/stripe/webhook/route.ts`) is the source of truth** for `payment_status` and the ledger. Server actions make *best-effort* Stripe calls wrapped in `safe()` — they never throw out of a form action, because the webhook reconciles state. Webhook idempotency uses the `stripe_events` table (event id is the PK; a duplicate insert = a Stripe retry, acknowledged without reprocessing). The route pins `runtime = "nodejs"` and verifies the raw body signature.

## Gotchas

- **Stripe Connect region must match the platform account.** Destination charges + application fees only work when the connected account is in the platform's region (US/UK/EEA/CA/CH — **MX excluded from cross-border**). New-account country is env-driven via `STRIPE_CONNECT_COUNTRY` (default `MX`). For local testing against a non-MX test platform, set it to the platform's country. **Production blocker: the real platform Stripe account must be a Mexico entity** before onboarding real talacheros — a business/legal decision, not a code change (see HANDOFF.md).
- **`.env.example` shows default Supabase ports (`54321`); the local stack here is remapped +1000 (`55321`).** Copy the real values from `pnpm exec supabase status`.
- **Changing a function's OUT columns:** `CREATE OR REPLACE` can't alter return columns — `DROP` then `CREATE`.
- **Prettier drift:** committed Phase 1 files don't all match current prettier output, so `pnpm format` reformats unrelated files. Format only the files you touched.
- **Seed runner batching:** `supabase db reset` doesn't preserve session temp tables across statement batches — write seeds as a single `DO` block.

## Context files

- **`HANDOFF.md`** — living session-to-session status, current phase, blockers, and a payments test runbook. Read it at the start of substantial work.
- **`prd.md`** / **`plan.md`** — product requirements and phased build plan (referenced throughout migrations as "PRD §…").
- **Notion task board (`✅ Tareas`)** — sprint/task tracker of record (JALO project). Board grouped by sprint: Sprint 1 (Stripe MX unblock), Sprint 2 (provider self-service), Sprint 3 (polish + live QA), Post-launch. URL: https://app.notion.com/p/jumpafterus/e70360225ed44e46954a6e1e756c0fb8?v=a33b9ec386e34cfa801143114deccf25
