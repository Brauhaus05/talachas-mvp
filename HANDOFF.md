# Session Handoff — 2026-07-06

> Read alongside [prd.md](./prd.md) and [plan.md](./plan.md). This captures what the code and git log **don't** — session decisions, verification state, and where to pick up.

## Where we are

| Phase | Status |
|---|---|
| **0 — Foundation** | ✅ merged (`f9b0321`) — Next 16, React 19, Tailwind v4, next-intl, CI |
| **1 — Clickable demo (5 Figma screens, mock data)** | ✅ merged (`843107f`) |
| **2 — Data model + Auth** | ✅ merged (PR #1) |
| **3 — Search / profile / booking (real data)** | ✅ merged (PR #2 + #3) — exit criterion met |
| **4A — Stripe Connect onboarding** | ✅ merged (PR #4) — onboarding verified in Stripe test mode |
| **4B — Payments (checkout / capture / refund / tips / ledger)** | ✅ merged (PR #6) + **verified end-to-end in Stripe test mode** (2026-07-04); verification fixes in **PR #7 (merged)** |
| **5A — Chat + in-app unread badge** | ✅ merged (PR #10) — real-time 1:1 chat per booking (Supabase Realtime), **verified live in the browser** (2026-07-04) |
| **5B — Email notifications (Resend)** | ✅ **verified live + PR #12 merged** (2026-07-06) — 4 transactional emails; typecheck/lint/secretless-build green; live email run + recipient-locale routing confirmed against a real Resend key. |
| **6 cycle 1 — Reviews loop** | 🟢 **code-complete + fully reviewed, PR #13 OPEN** (2026-07-06, branch `feat/phase6-reviews-loop`) — client→talachero reviews on completed bookings; typecheck/lint/secretless-build green + DB-level checks. **Not yet merged; owner browser check pending** (runbook below). Admin panel = cycle 2 (not built). |

`main` carries Phases 0–4B **+ 5A + 5B** (PR #12 merged 2026-07-06). Phase **6 cycle 1 (reviews loop)** is built + reviewed on branch `feat/phase6-reviews-loop` (**PR #13 open**) but not yet merged — see the Phase 6 section below. The local Supabase stack docker volume preserves seed data + this session's test data (`pnpm exec supabase start` to resume if stopped). **⚠️ Phase 6's seed work required a `db reset`, which wiped Carlos's Stripe onboarding** — re-onboard a talachero (4A flow) before testing payments locally again.

**The core marketplace loop is now real end-to-end:** discover → book (concurrency-safe slot) → pay (Stripe escrow, manual capture) → **chat** → accept → complete → capture + 15% split → tip → refund → **review**, with an immutable `transactions` ledger.

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
- **🐛 (DEFERRED → Phase 6 admin) Refund is unreachable through the UI.** `cancelBooking`'s refund branch only fires when `payment_status='captured'`, but capture happens *only* at completion, and **completed bookings expose no cancel control** on either dashboard (client shows tips only; talachero cancel is limited to `confirmed`/`in_progress`); the `cancel_booking` RPC also rejects `completed`. So the refund path is only reachable via the Stripe CLI (as verified above). **Decision (2026-07-04): a completed-booking refund is a mediated dispute/goodwill action → build it as an admin-panel action in Phase 6, not a self-service dashboard control.** The money mechanics are done (reverse-transfer + fee reversal, below) and the `captured` branch in `dashboard/actions.ts` is kept as the reference implementation (commented; do not delete). Full design + Phase 6 requirements: `docs/superpowers/specs/2026-07-04-completed-booking-refund-design.md`. Pairs with the deferred **cancellation-policy** tiers (partial/tiered refunds).
- **🐛 (FIXED) Refund didn't reverse the transfer or the fee.** `cancelBooking` called `stripe.refunds.create({ payment_intent })` with no `reverse_transfer` / `refund_application_fee`, so on a captured booking the client was refunded in full but the **talachero kept their payout** and the **platform ate the loss** (−$476). Fixed in `dashboard/actions.ts`: full refunds now set `reverse_transfer: true` + `refund_application_fee: true` (client whole, no party retains funds). **Partial/tiered refunds** per cancellation policy remain TODO (below) — today's fix assumes a full refund.

---

## Currency — env-driven (PR #9, 2026-07-04)

A single **`NEXT_PUBLIC_CURRENCY`** (default `MXN`) now drives **both** the Stripe charge currency and the display formatter (`src/lib/format.ts` → `getCurrency()` + `formatMoney`, replacing the old `formatMxn`). Set to `CAD` in `.env.local` for local testing against the Canadian platform account (charging MXN to a CA-region connected account conflicts); pairs with `STRIPE_CONNECT_COUNTRY`. **Production leaves both unset → MXN / MX.** No migration — the `bookings.currency` column still stores `MXN` (a harmless stale artifact; it's no longer the charge source and isn't read for display). **Verified live in the browser** (2026-07-04): a CAD booking charged `CA$560` + `CA$84` app fee to Carlos's CA connected account (PaymentIntent `currency: cad`), all display/ledger in CAD.

## Phase 5A — what shipped (chat + unread badge, PR #10)

- **Real-time 1:1 chat per booking** via Supabase Realtime, reusing the existing `chat_threads` / `chat_messages`. New migration `20260704120001_phase5_chat.sql` adds **`chat_reads`** (per-participant read watermark), **`get_or_create_thread`** (chat_threads had no INSERT policy), a tightened `chat_messages` INSERT policy (**cancelled booking → read-only**, enforced in DB + UI), **`get_unread_count`** / **`get_unread_map`**, and adds `chat_messages` to the **`supabase_realtime`** publication.
- **Per-booking chat page** `/dashboard/bookings/[id]/chat` (server route authorizes via the caller's own booking projection → **404 for non-participants**). Client `ChatView` subscribes to `postgres_changes`, sends via **direct RLS-guarded inserts** (optimistic append + id-dedup so the echo doesn't double), marks the thread read on open.
- **Unread badge** is **server-computed on navigation**: total on the "Mi panel" nav link + per-booking `Mensajes (n)` on cards. `getUnreadCount`/`getUnreadMap` **degrade gracefully** (a badge/RPC failure never breaks the layout it renders in).
- **Verified live in the browser** (2026-07-04): realtime send + receive, optimistic append (no dup), cancelled read-only, unread badge increments then clears on open, non-participant 404. typecheck / lint / build green.
- Design + plan: `docs/superpowers/specs/2026-07-04-chat-unread-badge-design.md`, `docs/superpowers/plans/2026-07-04-phase5-chat.md`.

## Phase 5B — what shipped (transactional email via Resend, branch `feat/phase5b-email-notifications`)

- **Architecture: inline best-effort sends** (design Option A) through a self-contained `src/lib/notifications/` module — `config` (lazy Resend env getters) · `send` (Resend wrapper: dev-redirect + no-op when unconfigured, never throws) · `context` (service-role recipient/booking lookup — contact spans `users` own-row RLS) · `templates` (localized grayscale HTML) · `notify` (3 internally-best-effort orchestrators). No event bus, no cron — the `notify.ts` seam preserves the migration path if a second consumer ever appears.
- **4 emails across 3 reactive events**: booking confirmed → client; payment **captured** (not authorized) → client (receipt) + talachero (payout, net of 15%); refund issued → client. Fired from `dashboard/actions.ts` (`acceptBooking`, gated on RPC success) and the Stripe webhook (`payment_intent.succeeded` non-tip branch; `charge.refunded`).
- **Recipient-locale i18n**: copy in a new `emails` namespace in `messages/{es,en}.json`, resolved by each recipient's own `users.locale` via direct bundle import (the webhook has no request locale). Client can get Spanish while the talachero gets English on the same event.
- **Idempotency** rides the existing webhook `stripe_events` PK dedupe (capture/refund emails send once even on Stripe retries); confirmed-email gated on a successful `respond_to_booking`.
- **Security**: user-controlled display names (`users.full_name`) are HTML-escaped at the interpolation choke point in `templates.ts` (transactional payment email = a phishing-injection target). `EMAIL_DEV_REDIRECT` is force-disabled when `NODE_ENV==="production"` so a stray env var can't redirect real customer mail.
- **Config/env** (`.env.example`): `RESEND_API_KEY` (unset → all sends no-op, CI/build stay green), `EMAIL_FROM` (default `Talachas <onboarding@resend.dev>`), `EMAIL_DEV_REDIRECT` (non-prod: redirect all mail to one inbox, real recipient shown in `[→ …]` subject prefix — needed because seed addresses `*.demo.talachas.mx` are non-deliverable).
- **Verification**: typecheck + lint + **secretless `next build`** green; per-task spec+quality reviews + a final whole-feature review (no Critical/Important). **Live email run ✅ done (2026-07-06)** — all 4 emails delivered against a real Resend key + recipient-locale routing confirmed (results under "▶ Verify 5B" below). **PR #12 merged.**
- **Deferred to Phase 6** (unchanged from the design): the **24h reminder** (needs cron) and the **new-review email** (needs the review UI). Two forward-looking Minor notes from review, tracked in Gotchas: refund email shows booking price (correct while all refunds are full) and recipient emails appear in server error logs.
- Design + plan: `docs/superpowers/specs/2026-07-06-phase5b-email-notifications-design.md`, `docs/superpowers/plans/2026-07-06-phase5b-email-notifications.md`.

### ✅ Verified 5B (2026-07-06, owner + Claude, Stripe test mode, Resend, `EMAIL_DEV_REDIRECT`)

Ran the full runbook end-to-end with `RESEND_API_KEY` + `EMAIL_DEV_REDIRECT=brauhaus05@gmail.com` against the live Resend API (seed addresses bounce, so all mail redirected to the owner's inbox with the real recipient in the `[→ …]` subject prefix). Drove a real booking Mariana → Carlos through **accept → complete → refund**; **all four emails delivered**:

1. **Booking confirmed** → client (on `acceptBooking`).
2. **Payment receipt** → client + **payout** → talachero (on capture; payout shown ~15% below the CA$560 service total).
3. **Refund** → client (via `stripe refunds create --payment-intent <pi> --reverse-transfer --refund-application-fee` → `charge.refunded`).
4. **Recipient-locale routing confirmed** — with the client set to `locale='en'` and the talachero left at `es`, a single **capture** event delivered the client's receipt in **English** and the talachero's payout in **Spanish** simultaneously (each recipient resolves their own `users.locale`, independent of the actor). Mariana's locale reverted to `es` afterward.

Ledger reconciled throughout: `charge 560.00 CAD` on capture, `refund 560.00 CAD` (full reversal) on refund; booking `authorized → captured → refunded`.

> **Gotcha surfaced during the run:** the client "book + pay" step fires **no** email (payment is only *authorized* there) — all 4 emails fire on **accept / complete / refund**. Also, the **booking flow lives under `/talacheros` → `/book/[profileId]`, NOT the dashboard** — the dashboard's completed-booking cards show **tip presets**, which are easy to click by mistake (a `tipBooking` + `?tipped=1` in the dev log means you hit the tip button, not a booking; tips deliberately send no email). Direct booking URL: `/{locale}/book/{talachero_profile_id}`.

## Phase 6 cycle 1 — what shipped (reviews loop, branch `feat/phase6-reviews-loop`, PR #13 open)

Decomposed Phase 6 into two cycles: **cycle 1 = the reviews loop** (this branch), **cycle 2 = the admin panel** (its own spec/plan/build, not started). Client → talachero only for MVP (bidirectional deferred — schema already supports it, no migration needed).

- **`create_review` SECURITY DEFINER RPC** (migration `20260706120002`) — validates client-only, completed-only, one-per-booking; typed errors (`already_reviewed`, `booking_not_completed`, `not_your_booking`, `invalid_rating`, …). Direct `INSERT` on `reviews` **revoked** from `authenticated` + the old permissive INSERT policy **dropped**, so every review write goes through the RPC (same posture as `bookings` mutations).
- **Rating rollup** (migration `20260706120001`) — `AFTER INSERT/DELETE` trigger derives `talachero_profiles.rating_avg`/`rating_count` from real review rows (were hand-set in the seed, decoupled). Fires on DELETE too, so cycle-2 admin "delete review" fixes the rollup for free. Those two columns are **`REVOKE UPDATE` from `authenticated`** (talachero can't spoof their rating).
- **`has_review`** added to `get_my_bookings` (migration `20260706120003`, DROP+CREATE, grant re-issued) → `hasReview` on `ClientBooking`.
- **UI** — client dashboard completed-card shows **"Leave a review"** / "Review submitted"; `/dashboard/bookings/[id]/review` page authorizes via the caller's own booking projection (**404** for non-owner / non-completed / already-reviewed); interactive `RatingInput` (star selector) + comment → `submitReview` action (error codes allowlisted to a translatable set); `?reviewed=1` success banner (matches booked/paid/tipped).
- **New-review email** — best-effort to the talachero (their locale), reuses the 5B notifications module; **does not quote the comment body**. Closes one of the two deferred 5B emails.
- **Seed** — stops hand-setting rating aggregates; the trigger derives them (all 10 demo talacheros show real 4.0–5.0 ratings). **This required a `db reset` → Carlos's Stripe onboarding is wiped.**
- **Verification**: typecheck / lint / secretless build green; DB-level (rollup tracks insert/delete, RPC guards, `has_review` resolves, post-reset aggregates match real rows with 0 drift, full flow smoke test). Built via subagent-driven development — each of 9 tasks passed spec + code-quality review, plus a final holistic review; review caught & fixed the two column/insert lockdowns, a re-issued grant, action error-allowlisting, and two a11y fixes.
- Design: `docs/superpowers/specs/2026-07-06-phase6-reviews-loop-design.md` · Plan: `docs/superpowers/plans/2026-07-06-phase6-reviews-loop.md`.

### ▶ Verify 6-cycle-1 now (owner) — pending
Bring the stack up. As a client, **complete a fresh booking** (the seed reviews *every* seeded completed booking, so existing ones show no CTA — you need a new completion): book → pay → as the talachero accept + **Marcar completada**. Then as the client: dashboard shows **"Leave a review"** → submit stars + comment → `?reviewed=1` banner + card flips to "Review submitted"; the talachero's profile shows the review + updated rating. Revisit the review URL → **404**; a duplicate submit → `already_reviewed`. With a `RESEND_API_KEY` set, the talachero gets the **new-review email** in their locale. Then merge PR #13.

## What's next (remaining MVP — PRD's 11 in-scope items)

Done (11/11 features; reviews loop = **Phase 6 cycle 1**, PR #13 open pending owner browser check + merge): auth, profiles, KYC (Connect), search/filter, availability slots, booking + concurrency, payments/commission/tips, **1:1 chat**, **transactional email**, **reviews loop**.

| Phase | Scope | Size |
|---|---|---|
| **6 cycle 2 — Admin panel** | admin panel at `/dashboard/admin` (placeholder shell exists): users list + ban, bookings list + **force-refund** (the deferred completed-booking refund control — reverse-transfer mechanics ready in `dashboard/actions.ts`, design in `docs/superpowers/specs/2026-07-04-completed-booking-refund-design.md`), reviews list + delete (rollup trigger already handles the DELETE), disputes queue (**needs a flag mechanism — none exists today**). No seed admin user exists — create one via service role/SQL. | 1.5–2 d |
| **Deferred 5B emails** | **24h reminder** (needs a scheduler/cron) + the **new-review email is now DONE** in cycle 1. | folds into 6 |

**Recommended order:** owner verifies + merges PR #13 → **Phase 6 cycle 2 (admin panel)**, slotting the deferred talachero self-service tooling in before onboarding real (non-seed) talacheros.

---

## Stack + decisions confirmed

- Frontend/hosting: Next.js on Vercel · DB/auth/storage/realtime: Supabase · Payments: Stripe Connect
- **KYC**: Connect Express hosted onboarding drives `verification_status` (no separate Stripe Identity for MVP)
- **Coverage area**: center point + radius (not polygon) for MVP
- **Location UX**: neighborhood picker (colonia points + `ST_DWithin`) — **deferred**, lands when a location input appears in search
- **Commission**: 15% via `PLATFORM_FEE_PCT` env
- **Slot granularity**: 1 hour; a booking reserves one slot (`hours` is an informational price estimate)
- **Chat provider (Phase 5)**: Supabase Realtime — **shipped in 5A**
- **Currency**: env-driven `NEXT_PUBLIC_CURRENCY` (default `MXN`); prod unset. See the Currency section above

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

**Design constraints:** grayscale only (tokens, never hex/rgb; state via icon+text). Every visible string through `t()`; keep `messages/es.json` and `messages/en.json` in sync (same key set — a quick `node -e` diff of the two catches drift).

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
- **Supabase Realtime (chat)** — a table must be in the `supabase_realtime` publication AND the subscriber must pass the table's RLS `SELECT` to receive `postgres_changes` (so both booking participants get messages; outsiders get nothing). The browser client authenticates the stream via the SSR session. The **channel takes ~1s to reach `SUBSCRIBED`** after mount — a message sent in that window won't arrive via the echo, so `ChatView` **optimistically appends the sent row** (deduped by id) rather than relying on the echo alone.
- **Server-computed unread badge** — `TopNavBar`/dashboards read `get_unread_count`/`get_unread_map` on render; **mark-read** (`chat_reads` upsert) happens client-side on chat open, so the badge clears on the *next* navigation, not instantly (by design — see 5A spec). These RPCs degrade to 0/empty on error so a failure never breaks the layout.
- **Email is best-effort and off-by-default** (5B) — the `notify*` functions swallow all errors (never throw into a form action or the webhook), and `sendEmail` **no-ops when `RESEND_API_KEY` is unset**, so builds/CI and email-less dev stay green with no email traffic. To actually send, set the key. Seed addresses (`*.demo.talachas.mx`) bounce — set `EMAIL_DEV_REDIRECT` to a real inbox locally. `EMAIL_DEV_REDIRECT` is hard-ignored in production (`NODE_ENV==='production'`) so a leaked value can't reroute real customer mail. **Payment "processed" = capture (completion), not authorize.**
- **Two forward-looking 5B notes** (from final review, not bugs today): (1) the **refund email displays the booking price**, which is correct while every refund is a *full* refund — thread `charge.amount_refunded` through `notifyRefundIssued` when partial/tiered refunds land (pairs with the deferred cancellation-policy windows). (2) `send.ts`/`notify.ts` log **recipient email addresses** to `console.warn/error` on failure — fine for MVP (server-only, own users, low volume), redact to local-part/`bookingId` if a production PII-log policy is adopted.

---

## What to say to Claude next session

> Continuing Talachas. Phases 0–4B, **5A, 5B all merged**; **Phase 6 cycle 1 (reviews loop) is code-complete + fully reviewed on branch `feat/phase6-reviews-loop`, PR #13 OPEN** (client→talachero reviews on completed bookings: `create_review` RPC, rating-rollup trigger, review form + dashboard prompt, new-review email). **It still needs the owner's browser check, then merge** — runbook in the "▶ Verify 6-cycle-1" section (complete a *fresh* booking first; the seed reviews every existing completed booking). Once merged, start **Phase 6 cycle 2 — admin panel** at `/dashboard/admin` (placeholder shell exists): users/ban, bookings/**force-refund** (completed-booking refund; reverse-transfer mechanics ready in `dashboard/actions.ts`, design in `docs/superpowers/specs/2026-07-04-completed-booking-refund-design.md`), reviews/delete (rollup trigger already handles DELETE), disputes queue (**needs a flag mechanism — none exists**). No seed admin user exists — create one via service role. The **24h reminder email** (needs cron) is still deferred; the **new-review email is done** (cycle 1). `CLAUDE.md` is the fast architecture read.

**Before onboarding any real talacheros**, resolve the **🚨 MX platform Stripe account** production blocker (below), plus the deferred **talachero self-service tooling** and **neighborhood `ST_DWithin` search**.

**Local test note:** `.env.local` has `STRIPE_CONNECT_COUNTRY=CA` **and `NEXT_PUBLIC_CURRENCY=CAD`** (workarounds so the Canadian test platform can charge + pay connected accounts). **⚠️ Phase 6's seed work ran a `db reset`, so Carlos's Stripe onboarding is WIPED** — re-onboard (4A flow: sign in as `carlos.mendoza@demo.talachas.mx` → Configurar pagos, with `STRIPE_CONNECT_COUNTRY=CA`) before testing payments again. The Supabase stack may be running (started this session for migrations) — `pnpm exec supabase start`/`stop` as needed. **Use `migration up`, not `db reset`, once re-onboarded** (a reset re-wipes onboarding). For real MX production, unset both env overrides.
