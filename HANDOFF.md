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
| **4B — Payments (checkout / capture / refund / tips / ledger)** | ✅ merged (PR #6) + **verified end-to-end in Stripe test mode** (2026-07-04); verification fixes in **PR #7 (merged)** |
| **5A — Chat + in-app unread badge** | ✅ merged (PR #10) — real-time 1:1 chat per booking (Supabase Realtime), **verified live in the browser** (2026-07-04) |

`main` is at `0a590e7` (Phases 0–4B **+ 5A**). This session merged **PR #7** (4B verification fixes + expanded `CLAUDE.md` — start there for a fast architecture read), **PR #8** (completed-booking refund UI deferred to Phase 6 admin), **PR #9** (env-driven currency), and **PR #10** (Phase 5A chat + unread badge). Working tree clean. The local Supabase stack is **currently stopped** — `pnpm exec supabase start` to resume; the docker volume preserves seed data + Stripe onboarding + this session's chat/booking test data.

**The core marketplace loop is now real end-to-end:** discover → book (concurrency-safe slot) → pay (Stripe escrow, manual capture) → **chat** → accept → complete → capture + 15% split → tip → refund, with an immutable `transactions` ledger.

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

## What's next (remaining MVP — PRD's 11 in-scope items)

Done (9/11): auth, profiles, KYC (Connect), search/filter, availability slots, booking + concurrency, payments/commission/tips, **1:1 chat**.

| Phase | Scope | Size |
|---|---|---|
| **5B — Email notifications** | Resend for key events (booking confirmed, reminder, payment processed, new review), decoupled from business flows per PRD §6.6. The other half of Phase 5; chat + unread badge (5A) already shipped. | 1–2 d |
| **6 — Reviews loop + admin** | post-completion review prompt (schema exists; needs UI + rating-rollup trigger), admin panel (users/bookings/disputes/**refunds** — includes the deferred completed-booking refund control; mechanics ready in `dashboard/actions.ts`) | 2–3 d |

**Recommended order:** Phase 5B → Phase 6, slotting the deferred talachero self-service tooling in before onboarding real (non-seed) talacheros.

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

---

## What to say to Claude next session

> Continuing Talachas. Phases 0–4B **and 5A (chat + unread badge)** are merged; **4B and 5A were both verified live in the browser** in Stripe test mode (see the sections above). `main` is at `0a590e7`; `CLAUDE.md` is the fast architecture read. Next up: **Phase 5B — email notifications** (Resend) for key booking events (confirmed, reminder, payment processed, new review), decoupled per PRD §6.6 — the second half of Phase 5. Read `plan.md` §Phase 5 and `prd.md` §6.6, bring up the local stack (`pnpm exec supabase start` — data preserved), and brainstorm 5B before building.

**Before onboarding any real talacheros**, resolve the **🚨 MX platform Stripe account** production blocker (below), and note the deferred Phase 6 items: the **admin completed-booking refund control** (mechanics wired; design in `docs/superpowers/specs/2026-07-04-completed-booking-refund-design.md`) and **talachero self-service tooling**. If you'd rather tackle those, or the deferred **neighborhood `ST_DWithin` search**, before 5B, say so.

**Local test note:** `.env.local` has `STRIPE_CONNECT_COUNTRY=CA` **and `NEXT_PUBLIC_CURRENCY=CAD`** (workarounds so the Canadian test platform can charge + pay connected accounts). Carlos (`carlos.mendoza@demo.talachas.mx`) is onboarded as a **CA** test account. Session test data (in the docker volume): a CAD authorized booking + a demo chat thread between Mariana and Carlos. The Supabase stack is **stopped** — `pnpm exec supabase start` to resume. **Use `migration up`, never `db reset`** (a reset wipes Carlos's onboarding). For real MX production, unset both env overrides.
