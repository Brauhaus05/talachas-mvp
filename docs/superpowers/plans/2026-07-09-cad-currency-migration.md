# Eliminate MXN → all-CAD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Canadian dollars the app's real currency everywhere — flip all defaults from MXN/MX to CAD/CA, fix money display to a consistent `CA$`, and remove every `MXN` remnant from behavior, visible text, and the schema (keeping the env override seam).

**Architecture:** Flip the two config getter defaults (`getCurrency`, `getConnectCountry`); normalize `formatMoney` to render `CA$` in both locales; a new non-destructive migration flips DB `currency` defaults + backfills existing rows + replaces `create_booking`'s insert fallback; seed + i18n + env-doc literals updated.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, next-intl, Supabase (Postgres migrations), Stripe. **No test runner in this repo** — verification is `pnpm typecheck` + `pnpm lint` + secretless `pnpm build`, plus SQL assertions against the local Supabase stack (per CLAUDE.md).

**Reference spec:** `docs/superpowers/specs/2026-07-09-cad-currency-migration-design.md`

---

### Task 1: Flip app config defaults + fix money display

**Files:**
- Modify: `src/lib/format.ts`
- Modify: `src/lib/stripe/config.ts`

- [ ] **Step 1: `getCurrency()` default → CAD + refresh JSDoc**

In `src/lib/format.ts`, change the default and doc comment. Replace the `getCurrency` block:

```ts
/**
 * Configured currency for charges and display (ISO 4217, uppercase). Public
 * (`NEXT_PUBLIC_`) because it must be readable in client components and is
 * inherently user-facing — not a secret. Single source for the Stripe charge
 * currency and the money formatter so the two can't drift.
 *
 * Defaults to `CAD`. Overridable via `NEXT_PUBLIC_CURRENCY` (e.g. `MXN`) — pairs
 * with `STRIPE_CONNECT_COUNTRY`; the Stripe charge currency must match the
 * connected account's region (destination charges + application fees are
 * same-region only).
 */
export function getCurrency(): string {
  return process.env.NEXT_PUBLIC_CURRENCY?.trim().toUpperCase() || "CAD";
}
```

- [ ] **Step 2: `formatMoney()` → render `CA$` in both locales**

In `src/lib/format.ts`, replace the `formatMoney` body. Pin the number-format locale to `en-MX` (the only locale that renders the CAD symbol as `CA$`; `es-MX` would render `CAD 560`). The `locale` param stays for call-site compatibility but no longer affects the symbol:

```ts
export function formatMoney(
  amount: number,
  locale: string,
  currency: string = getCurrency()
): string {
  // Pin to en-MX so the currency symbol renders unambiguously as "CA$" in both
  // app locales (es-MX would render "CAD 560"). `locale` is kept for call-site
  // compatibility; it no longer changes the formatted output.
  void locale;
  return new Intl.NumberFormat("en-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
```

- [ ] **Step 3: `getConnectCountry()` default → CA + refresh JSDoc**

In `src/lib/stripe/config.ts`, replace the `getConnectCountry` block:

```ts
/**
 * Country for new Connect (Express) accounts. Defaults to Canada (CA).
 * Overridable via `STRIPE_CONNECT_COUNTRY`. Stripe blocks destination charges +
 * application fees across regions, so the Connect country and the charge
 * currency (`NEXT_PUBLIC_CURRENCY`) must match the platform account's region.
 */
export function getConnectCountry(): string {
  return process.env.STRIPE_CONNECT_COUNTRY?.trim() || "CA";
}
```

- [ ] **Step 4: Verify + commit**

Run: `pnpm typecheck && pnpm lint`
Expected: both pass. (If lint flags the unused `locale` param, rename it to `_locale` in the signature — call sites are positional so no other change is needed.)

Quick output check:
Run: `node -e 'const {formatMoney,getCurrency}=require("./src/lib/format.ts")' 2>/dev/null; node -e 'console.log(new Intl.NumberFormat("en-MX",{style:"currency",currency:"CAD",maximumFractionDigits:0}).format(560))'`
Expected: `CA$560`

```bash
git add src/lib/format.ts src/lib/stripe/config.ts
git commit -m "feat: default currency CAD + Connect country CA; render CA\$ in both locales"
```

---

### Task 2: Webhook ledger fallback + summary-action comments

**Files:**
- Modify: `src/app/api/stripe/webhook/route.ts` (~line 32)
- Modify: `src/app/[locale]/book/[talacheroId]/summary/actions.ts` (~lines 95–97)

- [ ] **Step 1: Webhook currency fallback `mxn` → `cad`**

In `src/app/api/stripe/webhook/route.ts`, find:

```ts
    currency: (currency ?? "mxn").toUpperCase(),
```

Replace with:

```ts
    currency: (currency ?? "cad").toUpperCase(),
```

- [ ] **Step 2: Clean the MXN workaround comment in summary actions**

In `src/app/[locale]/book/[talacheroId]/summary/actions.ts`, the comment near line 95 currently reads (approximately):

```ts
  // Charge in the configured currency (getCurrency, default MXN). Overridable
  // via NEXT_PUBLIC_CURRENCY — e.g. CAD for local tests against a CA platform
  // account, where charging MXN to a CA-region connected account conflicts.
```

Replace with:

```ts
  // Charge in the configured currency (getCurrency, default CAD). Overridable
  // via NEXT_PUBLIC_CURRENCY; must match the connected account's region.
```

(Match the exact existing wording when editing — reproduce the surrounding lines as-is except for the MXN references. No logic change.)

- [ ] **Step 3: Verify + commit**

Run: `pnpm typecheck`
Expected: pass.

```bash
git add src/app/api/stripe/webhook/route.ts "src/app/[locale]/book/[talacheroId]/summary/actions.ts"
git commit -m "chore: webhook currency fallback cad; drop MXN workaround comment"
```

---

### Task 3: User-visible price-filter label

**Files:**
- Modify: `messages/es.json` (line ~117, `filter_price`)
- Modify: `messages/en.json` (line ~117, `filter_price`)

- [ ] **Step 1: Update the Spanish label**

In `messages/es.json`, change:

```json
    "filter_price": "Rango de precio (MXN/h)",
```

to:

```json
    "filter_price": "Rango de precio (CAD/h)",
```

- [ ] **Step 2: Update the English label**

In `messages/en.json`, change:

```json
    "filter_price": "Price range (MXN/h)",
```

to:

```json
    "filter_price": "Price range (CAD/h)",
```

- [ ] **Step 3: Verify key-set parity + commit**

Run: `node -e "const e=Object.keys(require('./messages/es.json')),n=Object.keys(require('./messages/en.json')); const flat=o=>JSON.stringify(o); console.log('es/en top-level equal:', flat(Object.keys(require('./messages/es.json')).sort())===flat(Object.keys(require('./messages/en.json')).sort()))"`
Expected: `es/en top-level equal: true`

```bash
git add messages/es.json messages/en.json
git commit -m "i18n: price-range filter label MXN/h -> CAD/h"
```

---

### Task 4: DB migration — flip currency defaults, backfill, replace create_booking

**Files:**
- Create: `supabase/migrations/20260709120001_currency_cad.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260709120001_currency_cad.sql` with exactly:

```sql
-- Move the app to Canadian dollars: flip every `currency` column default from
-- MXN to CAD, backfill existing rows, and update create_booking's insert
-- fallback (the explicit INSERT bypasses the column default). Non-destructive.
-- Spec: docs/superpowers/specs/2026-07-09-cad-currency-migration-design.md

-- 1. Column defaults -> CAD
alter table public.talachero_profiles alter column currency set default 'CAD';
alter table public.bookings           alter column currency set default 'CAD';
alter table public.transactions        alter column currency set default 'CAD';

-- 2. Backfill mutable rows (currency here is not read for display or used as the
--    charge source). NOT transactions: it is the immutable append-only ledger
--    (PRD §6.4) — historical rows keep the currency actually charged.
update public.talachero_profiles set currency = 'CAD' where currency = 'MXN';
update public.bookings           set currency = 'CAD' where currency = 'MXN';
update public.cities             set currency = 'CAD' where slug = 'cdmx';

-- 3. create_booking: fallback 'MXN' -> 'CAD'. Signature/return unchanged, so
--    CREATE OR REPLACE preserves the existing grant (no re-grant needed).
create or replace function public.create_booking(
  p_talachero_id        uuid,
  p_slot_id             uuid,
  p_service_category_id uuid,
  p_hours               integer,
  p_address             text,
  p_notes               text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid            uuid := auth.uid();
  v_status         public.slot_status;
  v_slot_talachero uuid;
  v_rate           numeric;
  v_currency       text;
  v_booking_id     uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Reject a banned talachero before reserving the slot (they can't sign in to
  -- accept, so booking them would strand the client's payment).
  if exists (
    select 1 from talachero_profiles tp
    join auth.users au on au.id = tp.user_id
    where tp.id = p_talachero_id
      and au.banned_until is not null
      and au.banned_until > now()
  ) then
    raise exception 'talachero_unavailable';
  end if;

  -- Lock the slot row: concurrent create_booking calls on the same slot block
  -- here until the first commits, then observe the updated status.
  select status, talachero_id
    into v_status, v_slot_talachero
    from availability_slots
    where id = p_slot_id
    for update;

  if not found or v_slot_talachero <> p_talachero_id then
    raise exception 'slot_not_found';
  end if;
  if v_status <> 'open' then
    raise exception 'slot_unavailable';
  end if;

  select hourly_rate, currency
    into v_rate, v_currency
    from talachero_profiles
    where id = p_talachero_id;

  insert into bookings (
    client_id, talachero_id, service_category_id, slot_id,
    status, price, currency, address, notes
  )
  values (
    v_uid, p_talachero_id, p_service_category_id, p_slot_id,
    'requested',
    coalesce(v_rate, 0) * greatest(coalesce(p_hours, 1), 1),
    coalesce(v_currency, 'CAD'),
    p_address, p_notes
  )
  returning id into v_booking_id;

  update availability_slots set status = 'booked' where id = p_slot_id;

  return v_booking_id;
end;
$$;
```

- [ ] **Step 2: Apply to the running local stack (non-destructive)**

Ensure the stack is up: `pnpm exec supabase status` (if not, `pnpm exec supabase start`).
Run: `pnpm exec supabase migration up --local`
Expected: applies `20260709120001_currency_cad.sql` with no error.

- [ ] **Step 3: Assert no MXN survives in mutable data + defaults are CAD**

Run:
```bash
pnpm exec supabase db execute --local "select
  (select count(*) from talachero_profiles where currency='MXN') as tp_mxn,
  (select count(*) from bookings where currency='MXN') as bk_mxn,
  (select count(*) from cities where currency='MXN') as city_mxn;"
```
(If `db execute` isn't available in this CLI version, run the same SQL via `psql` against the local db on port `55322`, or in Studio at `:55323`.)
Expected: all three counts `0`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260709120001_currency_cad.sql
git commit -m "feat(db): flip currency defaults to CAD, backfill rows, create_booking fallback CAD"
```

---

### Task 5: Seed literals → CAD

**Files:**
- Modify: `supabase/seed.sql` (~line 92 profile update, ~line 189 booking insert)

- [ ] **Step 1: Talachero-profile seed currency**

In `supabase/seed.sql`, change:

```sql
      currency            = 'MXN',
```

to:

```sql
      currency            = 'CAD',
```

- [ ] **Step 2: Completed-booking seed currency**

In `supabase/seed.sql`, in the completed-booking `values (...)` row, change the literal `'MXN'`:

```sql
      au_id, tp_id, svc_id, 'completed', rate, 'MXN',
```

to:

```sql
      au_id, tp_id, svc_id, 'completed', rate, 'CAD',
```

- [ ] **Step 3: Confirm no `MXN` literal remains in seed + commit**

Run: `grep -n "MXN" supabase/seed.sql`
Expected: no output (exit 1).

```bash
git add supabase/seed.sql
git commit -m "chore(seed): seed currency CAD instead of MXN"
```

---

### Task 6: Env-example docs read CAD/CA as default

**Files:**
- Modify: `.env.example` (~lines 26–30, currency block; and the `STRIPE_CONNECT_COUNTRY` block)

- [ ] **Step 1: Reword the currency + country comments**

In `.env.example`, update the currency block so CAD reads as the default and MXN as the override example. Replace the currency comment/example lines (around lines 26–30):

```
# Currency for charges + display (ISO 4217). Default: CAD.
# Override to match the platform account's region (charge currency must match
# the connected account's region for destination charges + application fees).
# NEXT_PUBLIC_CURRENCY=CAD
```

Then find the `STRIPE_CONNECT_COUNTRY` comment block and reword it similarly so **CA** is the default and MX is the override example (keep the existing variable line, just fix the surrounding comment):

```
# Country for new Connect (Express) accounts (ISO 3166-1 alpha-2). Default: CA.
# Must match the platform account's region. Override example:
# STRIPE_CONNECT_COUNTRY=CA
```

(Reproduce the block's existing structure; only the wording/default changes. If the file interleaves these differently, edit in place to make CAD/CA the stated defaults.)

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs(env): CAD/CA are the defaults; MXN/MX shown as overrides"
```

---

### Task 7: Whole-change verification + grep gate

**Files:** none (verification only)

- [ ] **Step 1: Typecheck + lint + secretless build**

Move any local secrets aside so the build proves it's secretless:
Run: `pnpm typecheck && pnpm lint`
Expected: both pass.

Run: `mv .env.local .env.local.bak 2>/dev/null; pnpm build; mv .env.local.bak .env.local 2>/dev/null`
Expected: build completes; all `/dashboard/*`, `/book/*`, `/talacheros/*` routes present.

- [ ] **Step 2: MXN grep gate**

Run:
```bash
grep -rin "mxn\|peso" src messages supabase .env.example \
  | grep -vi "hourlyRateMxn\|subtotalMxn\|platformFeeMxn\|totalMxn\|startingRateMxn"
```
Expected: **no output.** The only permitted surviving matches are the intentional `*Mxn` code identifiers (filtered out above). If anything else prints, fix it.

Also confirm the historical migration files still contain their original `'MXN'` (they are immutable applied history — do NOT edit them; the new migration supersedes their effect):
Run: `grep -rln "MXN" supabase/migrations`
Expected: only the pre-existing migrations (`20260703*`, `20260707130002`) — **not** `20260709120001_currency_cad.sql`.

- [ ] **Step 3: create_booking smoke — new booking stores CAD**

With the running stack, book a slot end-to-end (or call `create_booking` via the app), then:
Run:
```bash
pnpm exec supabase db execute --local "select currency from bookings order by created_at desc limit 1;"
```
Expected: `CAD`.

- [ ] **Step 4: Final commit (if any fixes were made in Steps 1–3)**

```bash
git add -A
git commit -m "test: verify all-CAD change (typecheck/lint/build, grep gate, create_booking CAD)"
```

---

## Notes for the executor

- **Do NOT edit already-applied migrations** (`20260703*`, `20260707*`). The new migration `20260709120001_currency_cad.sql` supersedes their MXN effects; their literals are immutable history.
- **`migration up`, not `db reset`.** A reset wipes any talachero Stripe onboarding (HANDOFF gotcha). The migration + backfill fix the running stack non-destructively. Only reset if you deliberately want a fresh CAD seed — then re-onboard before payment testing.
- **`transactions` is deliberately not backfilled** — immutable ledger; only its default flips.
- **Prettier drift:** format only the files you touched (repo gotcha).
