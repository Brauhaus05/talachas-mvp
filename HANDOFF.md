# Session Handoff — 2026-07-11

> Read alongside [prd.md](./prd.md) and [plan.md](./plan.md). This captures what the code and git log **don't** — session decisions, verification state, and where to pick up.

---

## 🗓️ Session 2026-07-22 — profile editor merged + talachero availability editor

**PR #18 (talachero profile editor) — ✅ MERGED to `main` (squash `f5f3ed1`).** It was 0 commits behind `main` (no rebase needed despite the prior-session note). Notion **"Editor de perfil del prestador"** → **Hecho**. ⚠️ The task title mentions *foto* (photo) but the merged PR deferred photo upload + coverage zone — those need their own tracker rows.

**PR #NN — 🔶 OPEN, branch `feat/talachero-availability-editor` (off `main`):** first talachero **self-service availability editor** — closes Sprint 2 **"Editor de disponibilidad (horarios semanales y excepciones)"**. Built subagent-driven from a committed spec + plan in `docs/superpowers/` (`2026-07-22-talachero-availability-editor-*`), each task through spec + code-quality review, plus a final holistic review (**ready to merge**, no Critical/Important).
- **Model = Approach A "direct slot calendar"** (chosen over recurring-template/hybrid in brainstorming): the talachero directly opens/closes concrete 1-hour `availability_slots` rows on a **week grid** (`08:00–20:00`, hours 8–19), **14-day** rolling horizon paged into 2 weeks, mobile horizontal scroll, all in `America/Mexico_City`. **No recurring templates, no cron, no new tables** — the "horarios semanales" convenience layer is a deferred follow-up.
- **Two `SECURITY DEFINER` RPCs** (`supabase/migrations/20260722120001_availability_editor.sql`): `open_availability_slot(p_date, p_hour)` (CDMX→UTC math in Postgres like the seed; validates ownership + hour 8–19 + date window; GiST-exclusion makes duplicate/overlap an idempotent no-op) and `close_availability_slot(p_slot_id)` (deletes only `status='open'`; **`SELECT … FOR UPDATE`** mirrors `create_booking`'s lock so a concurrent booking can't be yanked — a booked slot raises `slot_booked`; to free it, cancel the booking). Slots kept their permissive owner RLS; writes still go through the RPCs for tz-correctness + atomic guards.
- Reader `getMyAvailability()` (open+booked, next ~14d, CDMX date/hour), server actions `openSlot`/`closeSlot` (optimistic-toggle friendly), client `AvailabilityGrid` (optimistic per-cell toggle with a `"pending"` double-click guard, past-hour cells disabled), route `/dashboard/talachero/availability` + talachero role guard, dashboard **"Editar disponibilidad"** link card (replaced the schedule placeholder), `availability` i18n namespace (es/en).
- **Verified:** typecheck/lint/**secretless build** green (route in the build list) + **DB-level RPC checks** (idempotent open returns same row, `out_of_range` hour/date, `slot_booked` guard, `not_authorized`) + **live browser pass as talachero Carlos** (open → optimistic check → persists across reload; close/toggle-off; past cells disabled with a **"Pasado — H:00"** aria-label and the boundary exactly at the current CDMX hour; zero console errors).
- **Two non-blocking follow-ups** logged from the final review (not fixed, note in PR): (a) `PlaceholderPanel` (`dashboard/dashboard-ui.tsx`) + the `dashboard.coming_soon` key are now **dead** — this PR removed the last consumer; delete in a cleanup pass. (b) Deliberate horizon-bound slack: grid renders 14 days, the RPC accepts `today..today+14`, the reader fetches a 15-day window — so `error_out_of_range` is defensive-only from the UI's perspective. Neither is a defect.

---

## 🗓️ Session 2026-07-16 — UI polish merged + talachero profile editor

**Notion task tracker now drives the work** — the "✅ Tareas" database (under JALO) with three sprints: **Sprint 1 · Desbloqueo Stripe MX**, **Sprint 2 · Autoservicio de prestadores**, **Sprint 3 · Pulido y QA en vivo**. Cross-checked every code-verifiable task against the repo this session (tracker was accurate — no false "done"s). Statuses updated as work progressed.

**PR #17 — ✅ MERGED to `main` (squash):** UI polish. Shared `Button` (`src/components/ui/button.tsx`) gained a `loading` prop (spinner + auto-disable + `aria-busy`), per-variant `active:` pressed states, and an `xs` size; **11 raw action `<button>`s migrated** to it (review/dispute/chat forms, admin confirm-button, payments panel, client + talachero booking actions). Selection chips (rating stars, search/booking filters) + nav sign-out intentionally left raw. Nav **"Cómo funciona" → "Catálogo"** (`nav.how_it_works` → `nav.catalog`, es/en). Closes Sprint 3 **Estados de botón** + **Títulos y etiquetas** (Notion: Hecho). typecheck/lint/build green.

**PR #18 — 🔶 OPEN, branch `feat/talachero-profile-editor` (off `main`):** first talachero **self-service profile editor** — bio, hourly rate, services + primary, years of experience. Photos + coverage-zone **deferred** (own tasks). Closes Sprint 2 **Editor de perfil** (Notion: En revisión).
- **`update_talachero_profile` SECURITY DEFINER RPC** (`supabase/migrations/20260716120001_*`) — forced by the `authenticated` UPDATE-revoke on `talachero_profiles`; validates `auth.uid()` ownership, writes ONLY bio/hourly_rate/years_experience, replaces the `talachero_services` set atomically, never touches money/verification/rating cols.
- Data reader `getMyTalacheroProfileForEdit`, server action `updateTalacheroProfile`, dedicated route `/dashboard/talachero/profile` + `ProfileForm` (services multi-select with a primary-star affordance), dashboard placeholder → **Editar perfil** link card, es/en copy.
- Built subagent-driven from a committed spec + plan in **`docs/superpowers/`** (per-task spec + code-quality review, final whole-branch review = ready to merge).
- **Verified:** typecheck/lint/build + **live end-to-end as a real talachero** (JWT → RPC via PostgREST: valid update persists, atomic on failure, all negatives rejected with correct codes, public directory reflects the change) + **in-browser inspection** (edit → save → grayscale success banner, service toggle, primary reassignment, reload persistence, dashboard card, public profile, zero console errors).
- **Independent of #17** (doesn't modify `Button`). If GitHub shows it behind after the #17 merge, rebase onto the new `main` before merging.

**Decisions:** **CA$/CAD price display is intentional until further notice** (matches the CA test Stripe platform; the MX production blocker below still stands). The editor's rate field is labeled MXN (stored `hourly_rate` currency); directory/display uses `NEXT_PUBLIC_CURRENCY`.

**Env at session end:** the local Supabase stack + dev server were started for migration/verification, then **shut down** (Supabase data preserved in its docker volume — `pnpm exec supabase start` to resume). Cloud Supabase / Vercel untouched. **⚠️ `main` now has #17 but `feat/talachero-profile-editor` was branched before that merge.**

---

## 🚀 LIVE on Vercel — https://talachas-mvp.vercel.app (2026-07-11, Stripe test mode, seed talacheros)

First cloud deployment. Decision: **deploy now with seed talacheros** (talachero self-service tooling still unbuilt — new talachero signups get an empty profile shell + Stripe onboarding only; to act as a bookable talachero, sign in to a seed account). Client signup → browse → book → simulate-pay works end-to-end against the 10 seed talacheros.

- **Vercel project:** `talachas-mvp` (scope `brauhaus05s-projects`, `prj_AReXIRBLwKuZuRDMCRNvAlZje2ct`) — **auto-deploys from `Brauhaus05/talachas-mvp` `main`** (GitHub connected). Production alias = `talachas-mvp.vercel.app` (== `NEXT_PUBLIC_APP_URL`, so Stripe return/success URLs resolve).
- **Cloud Supabase:** project `talachas-mvp`, ref **`rcpfxcwooptmadyacfkk`** (org `wkuavigarfybmuwlqidp`, East US / N. Virginia). All 16 migrations pushed (`db push`) + seed loaded (`db reset --linked`) → 10 demo talacheros live. **DB password is only in this session's scratchpad — save it to your password manager or reset it in the Supabase dashboard (Settings → Database).** The local `.env.local` / `supabase start` stack is untouched (still points at local `:55321`).
- **Auth config:** email confirmation **disabled** (`enable_confirmations=false` via `supabase config push`) so client/talachero signups get an immediate session — no SMTP needed; `site_url` + redirect URLs set to the Vercel domain. Local `config.toml` was edited only to push and then **reverted** (no repo change; local dev unaffected).
- **Stripe:** **TEST mode**, existing Canadian platform account. New webhook endpoint **`we_1Ts4wlEkZnbeTZfTVDMMBPbd`** → `https://talachas-mvp.vercel.app/api/stripe/webhook` (6 events: checkout.session.completed/expired, payment_intent.succeeded/canceled, charge.refunded, account.updated). Carried the test workarounds: `STRIPE_CONNECT_COUNTRY=CA`, `NEXT_PUBLIC_CURRENCY=CAD`. **MX production blocker below still stands** — this is the CA test platform.
- **Vercel prod env vars (10):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY` (test), `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`, `PLATFORM_FEE_PCT=0.15`, `STRIPE_CONNECT_COUNTRY=CA`, `NEXT_PUBLIC_CURRENCY=CAD`, `RESEND_API_KEY`. (Set for **Production** only; add Preview/Development if you want branch previews to work.)
- **Verified live (2026-07-11):** homepage + `/en/talacheros` render 10 seed talacheros in **CA$** with ratings/neighborhoods/availability (browser); `/` → `/es|/en` redirect; a real client signup returned an immediate session + `handle_new_user` created the `public.users` row + an authenticated RLS RPC (`get_my_bookings`) validated the cloud-issued JWT (API); webhook returns **400 "Invalid signature"** on a bad payload (route deployed + verifying).
- **✅ FULL PAYMENT CHAIN EXERCISED LIVE (2026-07-11, browser + Claude):** onboarded **Carlos** to Stripe test (his Connect acct `acct_1Ts58qIa2bsITW6W` was already complete on Stripe's side — **Refresh status** synced `charges_enabled=true`/`verified` into the cloud DB); signed in as **Mariana**, booked Carlos (slot reserved), paid on Stripe Checkout with `4242 4242 4242 4242` → `checkout.session.completed` webhook flipped booking `779be528` to **authorized** (PI `pi_3Ts5TjEkZnbeTZfT1pQfCf3Q`, manual-capture hold, CA$560 + CA$84 app fee, `transfer_data.destination` = Carlos's acct); Carlos **Accept** → confirmed → **Mark completed** → capture → `payment_intent.succeeded` webhook flipped to **captured** + wrote the immutable ledger `charge` row (CA$560 CAD). Both webhooks delivered to Vercel and processed (idempotency via `stripe_events`). **⚠️ Carlos is now Stripe-onboarded on the CLOUD project — a `supabase db reset --linked` would wipe it (same gotcha as local); use `migration up` for cloud schema changes.**

### ▶ Simulate a payment on the live site (owner runbook)
Seed talacheros are **not** Stripe-onboarded (seed doesn't set Stripe fields), and `confirmBooking` returns `talachero_not_payable` until `charges_enabled`. So onboard one first:
1. **Sign in** at https://talachas-mvp.vercel.app as `carlos.mendoza@demo.talachas.mx` / `password123` → talachero dashboard → **Configurar pagos** → complete Stripe Express **test** onboarding (Stripe pre-fills test data / offers a skip in test mode). Back on the dashboard the panel flips to **Activos** (`refreshOnboarding()` re-fetches capabilities on return — no `account.updated` webhook needed).
2. In an incognito window, **sign up a brand-new client** (proves the signup goal) or sign in `mariana.ruiz@demo.talachas.mx`. Open Carlos's profile → pick a slot → **Confirmar reserva** → pay on Stripe Checkout with test card **`4242 4242 4242 4242`**, any future expiry + any CVC.
3. Booking shows **Pago autorizado**. Sign back in as Carlos → **Aceptar** → **Marcar completada** (captures). Watch deliveries under the webhook in the Stripe test dashboard; ledger rows land via the webhook.

---

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
| **6 cycle 1 — Reviews loop** | ✅ **merged (PR #13, squash `00550c9`, 2026-07-07)** — client→talachero reviews on completed bookings; typecheck/lint/secretless-build green + **DB/RPC-level verification** (happy path, all 5 guards, rating rollup insert+delete, `has_review` flip). **UI browser walk-through still not eyeballed live** (Chrome extension wasn't connected) — see note below. |
| **6 cycle 2 — Admin panel** | ✅ **merged (PR #14, squash `49242e8`, 2026-07-07)** — users/ban, bookings/force-refund, reviews/delete, overview; 5 admin RPCs + ban-aware directory/booking + seed admin. build/typecheck/lint green + **DB-level verification** of every RPC (ban→infinity→cleared, `cannot_ban_admin`, read RPCs return data, delete-review rollback, non-admin `not_authorized`) + signed-out route guards (307). **Live force-refund + admin UI browser pass are owner runbooks** — see note below. |
| **6 cycle 3 — Disputes queue** | ✅ **merged (PR #15, squash `5e37306`, 2026-07-07)** — client flags a completed+captured booking → admin queue → resolve (full refund via shared `refundBookingIfCaptured` helper / dismiss). New `disputes` table + `dispute_status` enum + 3 RPCs (`raise_dispute`, `admin_list_disputes`, `admin_resolve_dispute`) + `has_dispute` on `get_my_bookings`. typecheck/lint/secretless-build green + **DB-level verification** (raise happy path + all 5 guards, list, resolve open→dismissed + `dispute_not_open` + non-admin `not_authorized`, `has_dispute` flip) + signed-out route guards (307). **Live resolve-with-refund + UI browser pass are owner runbooks** — see note below. |

`main` carries Phases 0–4B **+ 5A + 5B + 6 cycle 1 + 6 cycle 2 + 6 cycle 3** (disputes queue, PR #15 merged `5e37306` 2026-07-07). The local Supabase stack docker volume preserves seed data + this session's test data (`pnpm exec supabase start` to resume if stopped). **⚠️ Carlos's Stripe onboarding was wiped by an earlier `db reset`** — re-onboard a talachero (4A flow) before testing payments locally again. **The completed booking `9a28d83f` (Mariana → Carlos) is the primed fixture** for both the "Leave a review" CTA and (once marked `captured`) the "Report a problem" dispute CTA without Stripe re-onboarding.

**The core marketplace loop is now real end-to-end:** discover → book (concurrency-safe slot) → pay (Stripe escrow, manual capture) → **chat** → accept → complete → capture + 15% split → tip → refund → **review** → **dispute** (admin-mediated refund/dismiss), with an immutable `transactions` ledger.

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

A single **`NEXT_PUBLIC_CURRENCY`** drives **both** the Stripe charge currency and the display formatter (`src/lib/format.ts` → `getCurrency()` + `formatMoney`, replacing the old `formatMxn`); `STRIPE_CONNECT_COUNTRY` drives the Connect account country. Both remain env-overridable. **Verified live in the browser** (2026-07-04): a CAD booking charged `CA$560` + `CA$84` app fee to Carlos's CA connected account (PaymentIntent `currency: cad`), all display/ledger in CAD.

> **⚠️ UPDATE (2026-07-09) — the app is now all-CAD; MXN eliminated.** Defaults flipped: **`getCurrency()` → `CAD`**, **`getConnectCountry()` → `CA`** (the env overrides still work). `formatMoney` now pins the Intl number-locale to `en-MX` so the symbol renders unambiguously as **`CA$`** in both `es` and `en` (previously `es` rendered `CAD 560`). New migration **`20260709120001_currency_cad.sql`** flips the `currency` column default to `CAD` on `talachero_profiles` / `bookings` / `transactions`, **backfills** `talachero_profiles` / `bookings` / the `cdmx` city row to `CAD` (NOT `transactions` — immutable ledger), and recreates `create_booking` with a `'CAD'` fallback. Seed reseeds in CAD. **Correction to the note above:** `bookings.currency` **is** read for display (admin bookings/disputes tables + email receipts via `formatMoney(price, locale, currency)`), which is why the backfill matters. Only the CDMX **geography** stays Mexican (city `country_code='MX'`, `locale='es-MX'`, timezone) and the internal `*Mxn` field identifiers are unchanged — this was a currency change, not a geography rename. Design/plan: `docs/superpowers/specs/2026-07-09-cad-currency-migration-design.md` · `docs/superpowers/plans/2026-07-09-cad-currency-migration.md`. **DB verified live (2026-07-09):** `migration up` applied clean against the running stack; post-migration **0 MXN rows** in `talachero_profiles`/`bookings`/`cities` (backfill converted real pre-existing seed data), all three column defaults → `'CAD'`, `create_booking` fallback = `CAD` (no `MXN`), and a rolled-back end-to-end `create_booking` stored `currency='CAD'`. Shipped as **PR #16** (squash `3b3f817` on `main`). **Browser-verified live (2026-07-09):** drove `/es/talacheros` and `/en/talacheros` in Chrome — talachero cards render **`CA$200`…`CA$150/hora`** and the price filter reads **"RANGO DE PRECIO (CAD/h)" / "PRICE RANGE (CAD/H)"** in both locales (confirms the `CA$` fix — `es` previously rendered `CAD 200`). Probe: with `NEXT_PUBLIC_CURRENCY` temporarily unset the page **still** showed `CA$`/`(CAD/h)`, proving the flipped `getCurrency()` **default** (not just the env override). Header still reads "CIUDAD DE MÉXICO" — CDMX geography intentionally unchanged.

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

## Phase 6 cycle 1 — what shipped (reviews loop, PR #13 merged `00550c9` 2026-07-07)

Decomposed Phase 6 into two cycles: **cycle 1 = the reviews loop** (this branch), **cycle 2 = the admin panel** (its own spec/plan/build, not started). Client → talachero only for MVP (bidirectional deferred — schema already supports it, no migration needed).

- **`create_review` SECURITY DEFINER RPC** (migration `20260706120002`) — validates client-only, completed-only, one-per-booking; typed errors (`already_reviewed`, `booking_not_completed`, `not_your_booking`, `invalid_rating`, …). Direct `INSERT` on `reviews` **revoked** from `authenticated` + the old permissive INSERT policy **dropped**, so every review write goes through the RPC (same posture as `bookings` mutations).
- **Rating rollup** (migration `20260706120001`) — `AFTER INSERT/DELETE` trigger derives `talachero_profiles.rating_avg`/`rating_count` from real review rows (were hand-set in the seed, decoupled). Fires on DELETE too, so cycle-2 admin "delete review" fixes the rollup for free. Those two columns are **`REVOKE UPDATE` from `authenticated`** (talachero can't spoof their rating).
- **`has_review`** added to `get_my_bookings` (migration `20260706120003`, DROP+CREATE, grant re-issued) → `hasReview` on `ClientBooking`.
- **UI** — client dashboard completed-card shows **"Leave a review"** / "Review submitted"; `/dashboard/bookings/[id]/review` page authorizes via the caller's own booking projection (**404** for non-owner / non-completed / already-reviewed); interactive `RatingInput` (star selector) + comment → `submitReview` action (error codes allowlisted to a translatable set); `?reviewed=1` success banner (matches booked/paid/tipped).
- **New-review email** — best-effort to the talachero (their locale), reuses the 5B notifications module; **does not quote the comment body**. Closes one of the two deferred 5B emails.
- **Seed** — stops hand-setting rating aggregates; the trigger derives them (all 10 demo talacheros show real 4.0–5.0 ratings). **This required a `db reset` → Carlos's Stripe onboarding is wiped.**
- **Verification**: typecheck / lint / secretless build green; DB-level (rollup tracks insert/delete, RPC guards, `has_review` resolves, post-reset aggregates match real rows with 0 drift, full flow smoke test). Built via subagent-driven development — each of 9 tasks passed spec + code-quality review, plus a final holistic review; review caught & fixed the two column/insert lockdowns, a re-issued grant, action error-allowlisting, and two a11y fixes.
- Design: `docs/superpowers/specs/2026-07-06-phase6-reviews-loop-design.md` · Plan: `docs/superpowers/plans/2026-07-06-phase6-reviews-loop.md`.

### ✅ Verified 6-cycle-1 (2026-07-07, DB/RPC layer) + ▶ browser walk-through still open
**Merged (PR #13).** DB/RPC verification done live against a freshly SQL-seeded completed booking (Chrome extension wasn't connected, so the UI wasn't eyeballed):
- **Happy path** → `create_review` inserts; rating rollup recomputed the talachero **4.67/3 → 4.75/4**, stored == derived-from-rows (0 drift).
- **All 5 guards** return correct typed errors: `already_reviewed`, `not_your_booking`, `invalid_rating` (rating 0 and 6), `booking_not_completed`.
- **`has_review`** flips `true` in `get_my_bookings` after review; **DELETE rollup** reverts cleanly to 4.67/3 (the path cycle-2 admin "delete review" relies on).
- Auth-simulation recipe (reused elsewhere): `set local role authenticated; select set_config('request.jwt.claims','{"sub":"<user_id>","role":"authenticated"}',true);` then call the SECURITY DEFINER RPC — `auth.uid()` reads that GUC.

**Still to do (optional, owner):** the **browser UI pass** — dashboard **"Leave a review"** → submit stars + comment → `?reviewed=1` banner + card flips to "Review submitted"; talachero profile shows the review + updated rating; revisit review URL → **404**; duplicate submit → `already_reviewed`; with `RESEND_API_KEY` set, the talachero gets the **new-review email** in their locale. **Fresh booking `9a28d83f` (Mariana → Carlos, no review) is primed** so the CTA shows without Stripe re-onboarding — sign in as `mariana.ruiz@demo.talachas.mx` / `password123`. Connect the Claude-in-Chrome extension to have Claude drive it.

## Phase 6 cycle 2 — what shipped (admin panel, branch `feat/phase6-admin-panel`, PR open 2026-07-07)

Built via subagent-driven development (11 tasks, each through spec + code-quality review). Design: `docs/superpowers/specs/2026-07-07-phase6-admin-panel-design.md` · Plan: `docs/superpowers/plans/2026-07-07-phase6-admin-panel.md`.

- **5 admin RPCs** (all `SECURITY DEFINER`, gated on `is_admin(auth.uid())`, non-admin → `not_authorized`): `admin_set_ban` (writes `auth.users.banned_until` = `infinity`/null; self-ban → `cannot_ban_admin`), `admin_list_users`, `admin_list_bookings` (refundable), `admin_list_reviews` (curated reads, not RLS-exposed), `admin_delete_review` (rating-rollup trigger recomputes on the DELETE for free).
- **Ban-aware directory + booking** — `list_talacheros` / `create_booking` now drop or reject banned talacheros, so a ban both blocks sign-in (`banned_until`) **and** removes the talachero from search/booking.
- **Seed admin** — `admin@talachas.mx` / `password123` (created via service-role/SQL; admin can never self-assign at signup).
- **Shared refund helper** `src/lib/stripe/refunds.ts → refundCapturedBooking()` (reverse-transfer + fee reversal) now backs **both** `cancelBooking` and the new admin `forceRefund` — the completed-booking-refund caveat that lived in `dashboard/actions.ts` is resolved (this was the deferred 4B refund control; design `docs/superpowers/specs/2026-07-04-completed-booking-refund-design.md`).
- **UI** — `/dashboard/admin` overview links three admin-guarded sub-routes: **users** (`setBan` ban/unban), **bookings** (`forceRefund`), **reviews** (`deleteReview`), all through a shared confirm-button; `admin` i18n namespace in `messages/{es,en}.json` (in sync). Overview also dropped 6 stale i18n keys.

### ✅ Verified 6-cycle-2 (2026-07-07, DB layer + build + guards)
- **Build** clean — all 4 `/dashboard/admin*` routes in the route list, typecheck/lint green.
- **Every RPC end-to-end as the seed admin**: `admin_set_ban` → `banned_until=infinity`, unban → cleared, self-ban → `ERROR: cannot_ban_admin`; `admin_list_users/bookings/reviews` return rows (27/1/17); `admin_delete_review` deletes (17→16, rolled back so no seed loss); non-admin (Carlos) call → `ERROR: not_authorized`.
- **Route guards**: all 4 admin routes return **307** (auth redirect) to a signed-out request, none 500.
- **Still owner runbooks** (same posture as cycle 1's UI pass): (1) the **live force-refund** charge→refund needs Stripe test keys + a re-onboarded talachero + a captured booking (DB mechanics + reverse-transfer helper already proven in 4B); (2) the **admin UI browser walk-through** hasn't been eyeballed (sign in as `admin@talachas.mx`).

## Phase 6 cycle 3 — what shipped (disputes queue, PR #15 merged `5e37306` 2026-07-07)

Built via subagent-driven development (8 tasks, each through spec + code-quality review, plus a final holistic review). **Client-only, completed+captured bookings only** (tightest scope: a dispute means "I paid, the job had a problem → I want money back", which aligns exactly with the refund resolution). Design: `docs/superpowers/specs/2026-07-07-phase6-disputes-queue-design.md` · Plan: `docs/superpowers/plans/2026-07-07-phase6-disputes-queue.md`.

- **New `disputes` table + `dispute_status` enum** (`open`/`refunded`/`dismissed`), migration `20260707140001`. One dispute per booking (unique `booking_id`; **dismissal is final — no re-raise**, intentional). Direct INSERT/UPDATE/DELETE revoked from `authenticated`; client reads own via RLS, admin reads via curated RPC — all writes go through SECURITY DEFINER RPCs (same posture as `bookings`/`reviews`).
- **3 RPCs**: `raise_dispute` (client-only, completed-only, **captured-only** → typed `not_refundable`; plus `not_your_booking`/`booking_not_completed`/`empty_reason`/`already_disputed`); `admin_list_disputes` (curated projection, open-first); `admin_resolve_dispute` (is_admin(), `SELECT … FOR UPDATE` + `dispute_not_open` guard so concurrent resolves can't double-fire). `get_my_bookings` gains `has_dispute` (DROP+CREATE).
- **Refund resolution reuses cycle-2 mechanics**: new shared `src/lib/stripe/refunds.ts → refundBookingIfCaptured(bookingId): Promise<boolean>` backs **both** the admin `forceRefund` (cycle 2) and the new `resolveDispute`. **`resolveDispute` is outcome-driven** — the dispute is recorded `refunded` **only if the Stripe refund actually succeeded**; on failure/ineligibility it's left **open** (admin retries or dismisses) rather than recording a phantom refund. Dismiss path never refunds. The `charge.refunded` webhook remains the source of truth for `payment_status` + the ledger + the client refund email (5B).
- **UI** — client completed-card shows **"Report a problem"** (gated on `captured` + `!hasDispute`) → `/dashboard/bookings/[id]/dispute` page (404 for non-owner/non-completed/non-captured/already-disputed) with a reason textarea → `?disputed=1` banner; flips to "Report under review" once raised. Admin **`/dashboard/admin/disputes`** queue (parties, amount, reason, status) with **Refund**/**Dismiss** confirm actions on open rows; fourth overview card. `disputes` + `admin.disputes` i18n namespaces in `messages/{es,en}.json` (in sync).
- **Seed** — one open dispute on Mariana's completed booking (marked `captured`) so the queue renders without Stripe. Direct insert (seed is superuser). Takes effect on a future `db reset` only; this session did **not** reset.
- **No new emails** this cycle (the existing 5B refund email covers the refund case). Deferred add-ons: dispute acknowledge/dismiss emails, admin new-dispute alert.

### ✅ Verified 6-cycle-3 (2026-07-07, DB layer + build + guards)
- **typecheck / lint / secretless `next build`** green; both new routes (`/dashboard/admin/disputes`, `/dashboard/bookings/[id]/dispute`) in the route list.
- **DB verification** (auth-simulation recipe, rolled back): `raise_dispute` happy path → `open`; all guards (`already_disputed`, `empty_reason`, `not_your_booking`); `has_dispute` flips `true`; `admin_list_disputes` returns the row for an admin; `admin_resolve_dispute` open→dismissed, re-resolve → `dispute_not_open`, non-admin → `not_authorized`.
- **Route guards**: both new routes **307** to a signed-out request (admin/disputes → sign-in with `?redirect=…`), none 500.
- **Still owner runbooks**: (1) the **live resolve-with-refund** charge→refund needs Stripe test keys + a re-onboarded talachero + a captured booking (mechanics proven in 4B/cycle-2; the seeded dispute's booking has no PI so its Refund action correctly no-ops and leaves it open — only Dismiss applies without Stripe); (2) the **UI browser walk-through** of both the client "Report a problem" flow and the admin queue hasn't been eyeballed.
- **Known follow-ups from the final holistic review (non-blocking, not fixed this cycle):** (a) **Dismissed disputes show the client "Report under review" indefinitely** — `has_dispute` is a boolean and no dispute-resolution email fires, so the dismiss outcome is invisible to the client. Fix = expose `dispute_status` (not just the boolean) through `get_my_bookings` + a client "reviewed/closed" state (+ optional email). (b) **Admin force-refund on `/admin/bookings` can leave a dispute stuck `open`** — the two admin surfaces don't reconcile; the disputes queue also fetches but never renders `paymentStatus`/`createdAt` (the `admin.col_date` i18n key is currently unused). Fix = render a payment-status + date column in the disputes table (and/or hide disputes whose booking is already `refunded`). Both pair naturally with the deferred cancellation-policy/notification work.

## What's next (remaining MVP — PRD's 11 in-scope items)

Done (11/11 features): auth, profiles, KYC (Connect), search/filter, availability slots, booking + concurrency, payments/commission/tips, **1:1 chat**, **transactional email**, **reviews loop** (cycle 1). **Admin panel (cycle 2) merged (PR #14). Disputes queue (cycle 3) merged (PR #15).** All 11 PRD in-scope features are now code-complete; remaining work is polish + the deferred items below.

| Phase | Scope | Size |
|---|---|---|
| **Cancellation-policy tiers** | partial/tiered refunds so `refundBookingIfCaptured`/`refundCapturedBooking` can take an amount (today refunds are **full** only, in cycle-2 force-refund + cycle-3 dispute resolve). Would let a dispute be resolved with a partial refund. | ~1 d |
| **Deferred 5B email** | **24h reminder** (needs a scheduler/cron). Optional dispute acknowledge/dismiss + admin new-dispute-alert emails (deferred in cycle 3). | — |
| **Talachero self-service tooling** | onboarding form + availability editor (profiles/slots are seed-only today; RLS + grants already allow presentational edits). Slot **before onboarding real (non-seed) talacheros**. | — |

**Recommended order:** now that the app is **deployed** (top section), run the **payment-simulation runbook on the live site** (onboard a seed talachero to Stripe test, then client book → pay → capture) to close the last un-exercised chain. Then the owner **browser passes** still outstanding across cycles 1–3 (review CTA, admin panel, disputes flow), plus the two cycle-3 **non-blocking follow-ups** logged above (dismissed-dispute client visibility; admin force-refund ↔ disputes-queue reconciliation). Before onboarding any real (non-seed) talacheros, build the **talachero self-service tooling** (the deploy went out with seed talacheros only — new talachero signups get an empty profile shell and can't make themselves bookable) and resolve the **🚨 MX platform Stripe account** blocker (below), then **neighborhood `ST_DWithin` search**. Cancellation-policy tiers can land whenever partial refunds are wanted.

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

> Continuing Talachas. **The app is now DEPLOYED and live at https://talachas-mvp.vercel.app (2026-07-11, Stripe test mode, seed talacheros)** — see the "🚀 LIVE on Vercel" section at the top for the cloud Supabase project (`rcpfxcwooptmadyacfkk`), Vercel project (`talachas-mvp`, auto-deploys from `main`), Stripe test webhook, disabled email confirmation, what was verified live, and the **payment-simulation owner runbook** (onboard a seed talachero to Stripe, then book + pay with `4242…`). The one thing still un-exercised live is that Stripe onboarding→checkout→capture chain. Phases 0–4B, **5A, 5B, 6 cycle 1 (reviews loop), 6 cycle 2 (admin panel, PR #14) all merged**; **6 cycle 3 (disputes queue) merged (PR #15, `5e37306`)** (2026-07-07): new `disputes` table + `dispute_status` enum + 3 RPCs (`raise_dispute` client-only/completed+captured-only, curated `admin_list_disputes`, `admin_resolve_dispute` with `FOR UPDATE`+`dispute_not_open`), `has_dispute` on `get_my_bookings`, client "Report a problem" → `/dashboard/bookings/[id]/dispute` page + `?disputed=1` banner, admin `/dashboard/admin/disputes` queue with **Refund/Dismiss**. Refund reuses a new shared `refundBookingIfCaptured` helper (backs both cycle-2 `forceRefund` and cycle-3 `resolveDispute`); **resolveDispute is outcome-driven** (records `refunded` only if the Stripe refund actually succeeded, else leaves the dispute open). Verified at the **DB layer** (raise happy path + all guards, list, resolve incl. `dispute_not_open` + non-admin `not_authorized`, `has_dispute` flip), **build/typecheck/lint green**, signed-out route guards **307**. Owner runbooks still open across cycles 1–3: **live resolve-with-refund** (Stripe keys + re-onboarded talachero + captured booking) and the **UI browser passes** (review CTA, admin panel, dispute flow — sign in `mariana.ruiz@demo.talachas.mx` / `admin@talachas.mx`, all `password123`). **All 11 PRD features are code-complete (cycles 1–3 merged). Next work: owner browser passes across cycles 1–3, plus the two cycle-3 non-blocking follow-ups (dismissed-dispute client visibility; force-refund ↔ disputes-queue reconciliation).** Deferred: **cancellation-policy tiers** (partial refunds), **24h reminder email** (needs cron). `CLAUDE.md` is the fast architecture read.

**Before onboarding any real talacheros**, resolve the **🚨 MX platform Stripe account** production blocker (below), plus the deferred **talachero self-service tooling** and **neighborhood `ST_DWithin` search**.

**Local test note:** `.env.local` has `STRIPE_CONNECT_COUNTRY=CA` **and `NEXT_PUBLIC_CURRENCY=CAD`** (workarounds so the Canadian test platform can charge + pay connected accounts). **⚠️ Phase 6's seed work ran a `db reset`, so Carlos's Stripe onboarding is WIPED** — re-onboard (4A flow: sign in as `carlos.mendoza@demo.talachas.mx` → Configurar pagos, with `STRIPE_CONNECT_COUNTRY=CA`) before testing payments again. The Supabase stack may be running (started this session for migrations) — `pnpm exec supabase start`/`stop` as needed. **Use `migration up`, not `db reset`, once re-onboarded** (a reset re-wipes onboarding). For real MX production, unset both env overrides.
