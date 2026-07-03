# Talachas MVP — Build Plan

> Companion to [prd.md](./prd.md). Sequences the PRD's 11 in-scope items into shippable phases.
> **Stack:** Next.js (App Router, TS) · Supabase (Postgres + PostGIS, Auth, Storage, Realtime) · Vercel · Stripe Connect + Stripe Identity · Sendbird or Supabase Realtime for chat (TBD in Phase 5).
> **Milestone strategy:** clickable demo of the 5 Figma screens first, then layer real backend behind them.

---

## Phase 0 — Foundation (½–1 day)

Goal: repo boots, design tokens exist, i18n plumbing exists, deploy pipeline works.

- [ ] `create-next-app` (TS, App Router, Tailwind, ESLint). Enable `experimental.typedRoutes`.
- [ ] Install: `@supabase/supabase-js`, `@supabase/ssr`, `next-intl` (or `next-i18next`), `zod`, `react-hook-form`, `lucide-react`.
- [ ] Tailwind config: **grayscale-only** design tokens (PRD §5) — `background`, `surface`, `text.primary`, `text.secondary`, `text.muted`, `border`, `border.strong`, `focus`. Add semantic tokens (`state.success`, `state.error`, `state.warning`) that resolve to gray shades today so the color decision is a one-line change later.
- [ ] Typography scale (8pt grid), spacing scale, radii — expose as Tailwind theme extensions.
- [ ] shadcn/ui init (buttons, input, card, dialog, dropdown, avatar, badge, tabs) — override colors to grayscale tokens.
- [ ] `next-intl` config with `es` (default) and `en` locales. Empty message catalogs, `[locale]` route segment.
- [ ] Vercel project + preview deploys on PRs. Env vars: Supabase URL/anon key placeholders.
- [ ] Repo hygiene: prettier, eslint, husky pre-commit, GitHub Actions running `pnpm typecheck` + `pnpm test`.

**Exit criteria:** empty homepage deploys to Vercel preview, `/es` and `/en` switch, `pnpm typecheck` clean.

---

## Phase 1 — Clickable demo of Figma's 5 screens (2–4 days)

Goal: rebuild the Figma prototype as real Next.js pages using **mock data only** — no auth, no DB, no payments. Uses i18n keys from day one.

Screens (from Figma + PRD Appendix A):

1. **`/` Home / landing** — hero, task-description search input, "Servicios Populares" bento (4 tiles).
2. **`/talacheros` Search results** — filter sidebar (service, price, rating, availability) + card grid.
3. **`/talacheros/[id]` Talachero profile** — hero (avatar, name, rating, stats), services + prices, "Sobre mí", reviews list.
4. **`/book/[talacheroId]` Booking form** — service type, description, address, preferred date, payment method.
5. **`/book/[talacheroId]/summary` Checkout summary** — order summary, total, "Confirmar Reserva" CTA → success state.

Shared building blocks:

- [ ] `<TopNavBar>` (logo, search, nav links — matches Figma header).
- [ ] `<Footer>` (4 columns from Figma).
- [ ] `<TalacheroCard>` (used in search results).
- [ ] `<ServiceTile>` (bento tiles).
- [ ] `<ReviewCard>`, `<Rating>`, `<Avatar>`, `<PriceRow>`.
- [ ] `<FormField>` wrappers for react-hook-form + zod.

Mock data:

- [ ] `lib/mock/talacheros.ts` — 8–12 fake profiles (name, avatar, rating, services, hourly rate MXN, city CDMX).
- [ ] `lib/mock/services.ts` — 8 categories matching PRD §0 (armado, TV, mudanzas, mantenimiento, limpieza, jardinería, entregas, mandados).
- [ ] `lib/mock/reviews.ts` — 3–5 reviews per Talachero.

i18n:

- [ ] Every visible string → `t('key')`. Localize CDMX/MXN (Figma placeholder says "Vancouver" — override).
- [ ] `messages/es.json` populated; `messages/en.json` stub-translated.

**Exit criteria:** all 5 screens navigable end-to-end with mock data, grayscale-only, both locales work, matches Figma layout at 1280px + responsive down to 375px.

---

## Phase 2 — Data model + Auth (2–3 days)

Goal: PRD §7 schema live in Supabase, both roles can sign up and reach their dashboards.

Schema (migrations in `supabase/migrations/`):

- [ ] `cities` — seed with CDMX. Include `currency`, `locale`, `timezone`.
- [ ] `service_categories` — 8 seed rows with slug, name (i18n keys), icon.
- [ ] `users` — extends `auth.users`. Columns: `role` (`client|talachero|admin`), `locale`, `phone`, `city_id`, `created_at`.
- [ ] `talachero_profiles` — FK to users, `services[]`, `hourly_rate`, `currency`, `coverage_area` (**PostGIS `geography(Polygon)`**), `verification_status`, `portfolio_photos[]`, `rating_avg`, `rating_count`.
- [ ] `availability_slots` — FK to talachero, `start_time`, `end_time` (both `timestamptz`), `status`. Exclusion constraint to prevent overlap per talachero.
- [ ] `bookings` — full status enum, `price`, `tip`, `currency`, `slot_id`, timestamps.
- [ ] `transactions` — append-only ledger (revoke UPDATE/DELETE via RLS + table policy).
- [ ] `chat_threads`, `chat_messages` — 1:1 with booking.
- [ ] `reviews` — bidirectional, `booking_id` + `author_id` + `target_id`, unique per (booking, author).
- [ ] Enable PostGIS: `create extension postgis`.

Auth + RLS:

- [ ] Supabase Auth: email + phone OTP. Post-signup trigger inserts `users` row with role from signup metadata.
- [ ] RLS policies per table: clients see own bookings; talacheros see own profile/bookings/slots; admins bypass via service role.
- [ ] Role selector on signup: "Necesito ayuda" (client) / "Quiero ofrecer servicios" (talachero).
- [ ] `/auth/sign-in`, `/auth/sign-up`, `/auth/callback` routes. `@supabase/ssr` cookie session.
- [ ] Middleware: gate `/dashboard/*` by role.

Skeleton dashboards (no features yet, just landing):

- [ ] `/dashboard` (client) — placeholder "Tus reservas".
- [ ] `/dashboard/talachero` — placeholder "Tu perfil / Tu agenda / Tus solicitudes".
- [ ] `/dashboard/admin` — gated by `role='admin'`.

**Exit criteria:** can sign up as client or talachero, land on correct dashboard, RLS smoke test passes (client cannot read another user's bookings via anon key).

---

## Phase 3 — Search, profile, booking (real data) (3–5 days)

Goal: Phase 1's Figma screens are now backed by Supabase, not mock data.

- [ ] Talachero onboarding form: services, hourly rate, coverage area (map picker for polygon), portfolio upload to Supabase Storage.
- [ ] Availability editor: weekly recurrence generator → materialize `availability_slots` rows for next 4 weeks. UI: click-drag on calendar grid.
- [ ] Search API:
  - [ ] Server action / route handler: `serviceCategoryId`, `minRating`, `maxHourlyRate`, `date`, `location (lat/lng)` filters.
  - [ ] PostGIS query: `ST_Intersects(coverage_area, location_point)`.
  - [ ] Rank by rating desc, then distance.
- [ ] Profile page reads from DB, aggregates reviews, shows real availability slots.
- [ ] Booking flow:
  - [ ] Slot selection UI (day picker + time slots).
  - [ ] Booking mutation wrapped in Postgres transaction with `SELECT ... FOR UPDATE` on slot → set slot `booked` + insert booking `requested`. Reject if slot no longer open.
  - [ ] Talachero side: notification (via Supabase Realtime for now) with accept/reject action → sets booking `confirmed`.
- [ ] Cancellation flow with time-window policy (returns slot to `open`).

**Exit criteria:** two real users (one client, one talachero) can complete a booking end-to-end without any mocks. Concurrent booking attempt on same slot fails cleanly.

---

## Phase 4 — Payments + KYC (3–5 days)

Goal: Stripe Connect Express accounts for Talacheros, Stripe Identity for KYC, split payments with platform commission and tips.

- [ ] Stripe Connect Express onboarding link from talachero dashboard → account link → return URL updates `verification_status`.
- [ ] Stripe Identity session initiated during talachero onboarding; webhook updates `verification_status` on `identity.verification_session.verified`.
- [ ] Payment intents:
  - [ ] On booking `confirmed`: create PaymentIntent with `application_fee_amount` (platform commission, config value) and `transfer_data.destination = talachero_stripe_account_id`. Manual capture.
  - [ ] Capture on booking `completed`.
  - [ ] Idempotency keys on every create (`booking_id:action`).
- [ ] Tip flow: separate PaymentIntent after service completion with same transfer destination.
- [ ] Ledger: insert `transactions` row for every Stripe webhook event (`charge.succeeded`, `payout.paid`, `charge.refunded`, `application_fee.created`).
- [ ] Webhook handler at `/api/stripe/webhook` with signature verification. Idempotent (dedupe on `event.id`).
- [ ] Refund flow triggered by admin panel or automatic cancellation policy.
- [ ] Search visibility gate: only show talacheros with `verification_status = 'verified'`.

**Exit criteria:** test-mode end-to-end: client pays, funds held, talachero completes, funds captured and split, tip goes through, ledger consistent. Refund works and creates ledger row.

---

## Phase 5 — Chat + notifications (2–3 days)

Goal: 1:1 chat between client and talachero for each confirmed booking; email/push notifications for key events.

- [ ] Chat: start with **Supabase Realtime** on `chat_messages` table (cheaper, one less vendor). Revisit Sendbird/Twilio if we need read receipts, typing indicators, media messaging at scale.
- [ ] Chat UI in booking detail view. RLS: only booking participants can read/insert.
- [ ] Event bus abstraction: `lib/events/emit.ts` wraps insert into `events` table + Supabase Realtime broadcast. Prepares for later migration to SQS/RabbitMQ.
- [ ] Notifications:
  - [ ] Email via Resend (booking confirmed, reminder 24h, payment processed, new review, refund issued).
  - [ ] In-app notification center reads from `notifications` table.
  - [ ] Push notifications deferred until PWA/native (out of scope MVP, per PRD §4).
- [ ] Templates i18n'd (es + en).

**Exit criteria:** talachero and client can chat in real time; both receive email for the 5 lifecycle events; unread badge in nav.

---

## Phase 6 — Reviews + admin panel (2–3 days)

Goal: complete the bidirectional review loop and give ops a tool to moderate.

- [ ] Post-completion review prompt for both parties, rating (1–5) + comment. Enforces one review per (booking, author).
- [ ] Trigger to update `rating_avg` / `rating_count` on talachero profile.
- [ ] Reviews visible on talachero profile page (already stubbed in Phase 3).
- [ ] Admin panel (`/dashboard/admin`):
  - [ ] Users list with search, ban action.
  - [ ] Bookings list with filters, force-refund action.
  - [ ] Reviews list with delete action (for TOS violations).
  - [ ] Disputes queue (bookings flagged by either party).

**Exit criteria:** admin can resolve a mock dispute end-to-end (view booking, refund, delete offending review, ban user if needed).

---

## Cross-cutting (all phases)

- **Testing:** Vitest for units, Playwright for e2e on booking + payment happy paths (PRD §10). CI gates: typecheck, lint, unit, e2e-smoke.
- **Observability:** Vercel Analytics + OpenTelemetry (`@vercel/otel`) → Axiom or Grafana Cloud. Structured logs everywhere.
- **Feature flags:** GrowthBook or Vercel Edge Config. Wrap risky new flows (payments, new service category).
- **Security:** rate limit auth + payment + review endpoints (Upstash Ratelimit). RLS reviewed after every schema change. No card data ever touches our servers.
- **Design tokens:** every new component consumes tokens only — enforced by ESLint rule against hex/rgb literals in `.tsx`.
- **i18n discipline:** ESLint rule to flag string literals in JSX outside of `t()`.

---

## Open questions to resolve before Phase 3

1. **Coverage area UX** — polygon draw vs "pick city + radius"? Polygon is more accurate but harder UX. Recommendation: radius for MVP, polygon post-MVP.
2. **Commission %** — needs a business decision. Placeholder: 15%. Configurable via env.
3. **Cancellation policy windows** — full refund > X hours before slot, partial 0–X hours, none after. Needs numbers.
4. **Slot granularity** — 1-hour, 30-min, or talachero-defined? Recommendation: 1-hour for MVP.
5. **Chat provider decision** — commit to Supabase Realtime for MVP or invest in Sendbird now? Recommendation: Supabase, revisit at scale.

---

## Rough schedule (aggressive, single builder)

| Phase                      | Duration | Cumulative |
| -------------------------- | -------- | ---------- |
| 0. Foundation              | 1 day    | 1          |
| 1. Clickable demo          | 3 days   | 4          |
| 2. Data + Auth             | 3 days   | 7          |
| 3. Search/book (real data) | 4 days   | 11         |
| 4. Payments + KYC          | 4 days   | 15         |
| 5. Chat + notifications    | 3 days   | 18         |
| 6. Reviews + admin         | 3 days   | 21         |

~3 weeks of focused work to hit a working MVP; add ~1 week buffer for polish, QA, and content.
