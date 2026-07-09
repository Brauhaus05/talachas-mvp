# Design — Eliminate MXN, move the app to all-CAD

Date: 2026-07-09

## Goal

Make **Canadian dollars** the app's real currency everywhere. After this change, no
`MXN` / `peso` / `mxn` survives in runtime behavior, user-visible text, or the schema
as a default/literal — with two deliberate exceptions (below). The env override seam is
**kept**: defaults flip to CAD/CA, but `NEXT_PUBLIC_CURRENCY` and
`STRIPE_CONNECT_COUNTRY` still work.

This is a **currency change, not a geography rename.** The CDMX product framing, Spanish
default locale, and the internal `*Mxn` code identifiers (`hourlyRateMxn`, `subtotalMxn`,
`totalMxn`, `startingRateMxn`) are intentionally left untouched — they're never shown to
users and renaming them is pure churn/risk.

### Why

The platform Stripe account is Canadian; Stripe forbids destination charges +
application fees across regions (MX excluded from cross-border Connect). The app already
supports CAD via env overrides (the local-test workaround). This makes CAD the default so
the workaround becomes the product.

## Scope decisions (approved)

- **Configurability:** flip defaults to CAD/CA, keep the env override mechanism.
- **Internal `*Mxn` identifiers:** leave as-is (internal names, not user-visible).
- **DB currency columns:** flip defaults to `CAD` via a new non-destructive migration +
  backfill existing rows.
- **Money display:** render `CA$560` in *both* locales (unambiguous Canadian marker),
  fixing today's asymmetry (`es` → `CAD 560`, `en` → `CA$560`).

## Changes

### 1. Functional core (app code)

- **`src/lib/format.ts`**
  - `getCurrency()` default `"MXN"` → `"CAD"`; refresh the JSDoc.
  - `formatMoney()` — normalize the currency symbol to `CA$` in both locales. Today the
    number locale is `es-MX` / `en-MX`, and only `en-MX` yields `CA$` (`es-MX` yields
    `CAD 560`). Pin the number-format locale used for the currency style to `en-MX` (keeps
    `maximumFractionDigits: 0`) so both `es` and `en` render `CA$560`.
- **`src/lib/stripe/config.ts`** — `getConnectCountry()` default `"MX"` → `"CA"`; refresh
  the JSDoc.
- **`src/app/api/stripe/webhook/route.ts`** (~line 32) — ledger currency fallback
  `(currency ?? "mxn")` → `(currency ?? "cad")`.
- **`src/app/[locale]/book/[talacheroId]/summary/actions.ts`** — comment-only cleanup of
  the MXN/CA workaround notes (behavior already flows from `getCurrency()`; no logic
  change).

### 2. User-visible text

- **`messages/es.json`** and **`messages/en.json`** — `filter_price`:
  `(MXN/h)` → `(CAD/h)` in both files (keep the key set in sync).

### 3. DB layer — new migration `supabase/migrations/20260709xxxxxx_currency_cad.sql`

Non-destructive (`migration up`-safe; also correct under `db reset` since it runs after
the table/seed-insert migrations):

- **Flip column defaults to `'CAD'`** on every `currency` column that currently defaults to
  `'MXN'`:
  - `talachero_profiles.currency`
  - `bookings.currency`
  - `transactions.currency`
- **Backfill existing rows** (safe — these columns aren't read for display or used as the
  charge source):
  - `update talachero_profiles set currency = 'CAD' where currency = 'MXN';`
  - `update bookings set currency = 'CAD' where currency = 'MXN';`
  - `update cities set currency = 'CAD' where slug = 'cdmx';` (the one seeded city row;
    `cities.currency` is unread forward-looking metadata but carries a literal `MXN`).
  - **NOT `transactions`** — it's the immutable append-only ledger (PRD §6.4); historical
    rows keep the currency actually charged. Only its *default* is flipped. (Existing local
    test rows already carry `CAD` from the webhook.)
- **Recreate `create_booking`** (DROP + CREATE, from its latest definition in
  `20260707130002_ban_aware_directory.sql`) changing the insert fallback
  `coalesce(v_currency, 'MXN')` → `coalesce(v_currency, 'CAD')`. Required because the
  explicit `insert` bypasses the column default, so without this new bookings would still
  store `MXN` when `talachero_profiles.currency` is null.

### 4. Seed

- **`supabase/seed.sql`** — the two literal `'MXN'` → `'CAD'`:
  - talachero_profiles update (~line 92)
  - completed-booking insert (~line 189)

### 5. Env docs

- **`.env.example`** — reword the currency/country comments so **CAD / CA read as the
  default** and MXN / MX as the historical override example.

## Deliberately out of scope

- Geography rename (CDMX theme, `cities` row's `country_code='MX'` / `locale='es-MX'` /
  `timezone`, Spanish default) — untouched. Only the city row's *currency* is flipped.
- `*Mxn` code identifiers — untouched.
- `transactions` historical row values — untouched (immutable ledger).

## Verification

- `pnpm typecheck` + `pnpm lint` + secretless `pnpm build` green.
- `pnpm exec supabase migration up --local` applies clean.
- SQL assertions: no row in `talachero_profiles` / `bookings` / `cities` has
  `currency = 'MXN'`; `create_booking` inserts `CAD` (smoke a booking, check
  `bookings.currency`).
- Grep gate: no `MXN` / `mxn` / `peso` survives in `src/`, `messages/`, or as a
  default/literal in `supabase/` — except the intentional `*Mxn` identifiers and the
  `transactions`-historical / geography exclusions above.
- Spot-check `formatMoney` renders `CA$…` in both `es` and `en`.

## Operational note

Seed edits mean a `db reset` re-seeds in CAD; the migration + backfill also fix the
**running** stack non-destructively. Per HANDOFF, a `db reset` **wipes Carlos's Stripe
onboarding** — prefer `migration up` on the running stack, and re-onboard before payment
testing if a reset is done.
