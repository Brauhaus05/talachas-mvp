# Talachero Payment-History (Earnings) View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a talachero a dedicated earnings page — a summary header + a per-booking earnings list, in net (post-commission) terms — over the existing `transactions` ledger.

**Architecture:** A `SECURITY DEFINER` RPC aggregates the caller's ledger rows per booking (gross charge / tips / refunds); a server-side reader applies the 15% `PLATFORM_FEE_PCT` to derive net + summary totals (the fee env is server-only); read-only server components render summary tiles + a table. No writes — the ledger stays immutable.

**Tech Stack:** Next.js 16 App Router (Server Components), React 19, next-intl, Supabase (Postgres RPC + RLS), TypeScript strict, Tailwind v4, pnpm.

**Repo testing reality:** no unit-test runner. "Test" per task = `pnpm typecheck` + `pnpm lint` clean (and DB-level SQL via the auth-simulation recipe for the migration). Commit after each task. Branch: already on `feat/talachero-earnings` (spec committed there). Local Supabase stack is running.

**Spec:** `docs/superpowers/specs/2026-07-22-talachero-earnings-design.md`

---

## File Structure

- **Create** `supabase/migrations/20260722140001_talachero_earnings.sql` — `get_my_earnings` RPC.
- **Modify** `src/lib/supabase/database.types.ts` — regenerated.
- **Modify** `src/lib/data/talacheros.ts` — `EarningRow` / `EarningsView` + `getMyEarnings()`.
- **Modify** `messages/es.json` + `messages/en.json` — `earnings` namespace + 3 dashboard keys.
- **Create** `src/app/[locale]/dashboard/talachero/earnings/earnings-summary.tsx` — stat tiles.
- **Create** `src/app/[locale]/dashboard/talachero/earnings/earnings-table.tsx` — the list.
- **Create** `src/app/[locale]/dashboard/talachero/earnings/page.tsx` — route + role guard.
- **Modify** `src/app/[locale]/dashboard/talachero/page.tsx` — dashboard link card.

---

## Task 1: Database — `get_my_earnings` RPC

**Files:**
- Create: `supabase/migrations/20260722140001_talachero_earnings.sql`
- Modify (generated): `src/lib/supabase/database.types.ts`

**Prerequisite:** local Supabase stack running. Use `migration up`, never `db reset`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260722140001_talachero_earnings.sql`:

```sql
-- Talachero payment-history (earnings) view (Sprint 2).
-- Read-only projection over the immutable transactions ledger. Party names live
-- behind users own-row RLS, so this is SECURITY DEFINER (mirrors
-- get_talachero_bookings). One row per booking that has >=1 transaction, with
-- the ledger aggregated by type. Net/commission are derived app-side (the 15%
-- fee is a server-only env the DB doesn't know).
create or replace function public.get_my_earnings()
returns table (
  booking_id    uuid,
  client_name   text,
  service_slug  text,
  booking_date  timestamptz,
  currency      text,
  charge_gross  numeric,
  tip_total     numeric,
  refund_total  numeric,
  last_activity timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id,
    cu.full_name,
    sc.slug,
    coalesce(s.start_time, b.created_at) as booking_date,
    b.currency,
    coalesce(sum(t.amount) filter (where t.type = 'charge'), 0) as charge_gross,
    coalesce(sum(t.amount) filter (where t.type = 'tip'), 0)    as tip_total,
    coalesce(sum(t.amount) filter (where t.type = 'refund'), 0) as refund_total,
    max(t.created_at) as last_activity
  from bookings b
  join talachero_profiles tp on tp.id = b.talachero_id
  join users cu on cu.id = b.client_id
  join service_categories sc on sc.id = b.service_category_id
  left join availability_slots s on s.id = b.slot_id
  join transactions t on t.booking_id = b.id
  where tp.user_id = auth.uid()
  group by b.id, cu.full_name, sc.slug, s.start_time, b.created_at, b.currency
  order by max(t.created_at) desc;
$$;

grant execute on function public.get_my_earnings() to authenticated;
```

- [ ] **Step 2: Apply**

Run: `pnpm exec supabase migration up --local`
Expected: applies `20260722140001` with no error.

- [ ] **Step 3: DB-level verification (auth-sim, rolled back)**

There is no local `psql` binary — run via `docker exec -i supabase_db_talachas-mvp psql -U postgres < <file>`. Write to the scratchpad (don't commit):

```sql
begin;
-- a talachero + one of their existing bookings to attach test ledger rows to
select tp.user_id as tal_user, b.id as bk, b.currency as cur
  from public.talachero_profiles tp
  join public.bookings b on b.talachero_id = tp.id
  limit 1 \gset

-- insert a charge + tip + refund on that booking (service role = superuser here)
insert into public.transactions (booking_id, type, amount, currency) values
  (:'bk', 'charge', 560, :'cur'),
  (:'bk', 'tip',     50, :'cur'),
  (:'bk', 'refund', 560, :'cur');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', :'tal_user', 'role', 'authenticated')::text, true);

-- the caller sees exactly one row for this booking with the aggregation
select booking_id, charge_gross, tip_total, refund_total
  from public.get_my_earnings() where booking_id = :'bk';
-- expect: charge_gross=560, tip_total=50, refund_total=560

-- a DIFFERENT talachero must NOT see this booking
reset role;
select tp2.user_id as other_user
  from public.talachero_profiles tp2
  where tp2.user_id <> :'tal_user' limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', :'other_user', 'role', 'authenticated')::text, true);
select count(*) as should_be_zero
  from public.get_my_earnings() where booking_id = :'bk';
-- expect: 0

rollback;
```

Expected: first select → `560 | 50 | 560`; second → `should_be_zero = 0`; final `ROLLBACK`. If different, STOP and report BLOCKED with the actual output.

- [ ] **Step 4: Regenerate types + typecheck**

Run: `pnpm exec supabase gen types typescript --local > src/lib/supabase/database.types.ts` (stdout only — do NOT use `2>&1`, it can corrupt the file).
Then: `grep -c "get_my_earnings" src/lib/supabase/database.types.ts` → expect non-zero.
Run: `pnpm typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260722140001_talachero_earnings.sql src/lib/supabase/database.types.ts
git commit -m "feat(earnings): get_my_earnings RPC + regenerated types"
```

---

## Task 2: Reader — `getMyEarnings()`

**Files:**
- Modify: `src/lib/data/talacheros.ts` (append near the other `getMy*` readers)

- [ ] **Step 1: Add the types + reader**

At the top of `src/lib/data/talacheros.ts`, add the import (merge into an existing `@/lib/stripe/config` import if one exists — otherwise add this line):

```ts
import { getPlatformFeePct } from "@/lib/stripe/config";
```

Then append:

```ts
export interface EarningRow {
  bookingId: string;
  clientName: string;
  serviceSlug: string;
  /** ISO timestamp of the job (slot start, or booking creation). */
  date: string;
  currency: string;
  gross: number;
  commission: number;
  tip: number;
  net: number;
  refunded: boolean;
}

export interface EarningsView {
  rows: EarningRow[];
  summary: { totalNet: number; thisMonthNet: number; jobCount: number };
}

const EARN_TZ = "America/Mexico_City";
const cdmxMonthFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: EARN_TZ,
  year: "numeric",
  month: "2-digit",
});

/**
 * The signed-in talachero's earnings: one row per booking with ledger activity,
 * with net = charge×(1−fee) + tips (0 charge-portion if refunded), plus a small
 * summary. The 15% fee is applied server-side (env is not public). Degrades to
 * an empty view on error so the page never throws.
 */
export async function getMyEarnings(): Promise<EarningsView> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_earnings");
  if (error) {
    console.error("getMyEarnings failed:", error.message);
    return { rows: [], summary: { totalNet: 0, thisMonthNet: 0, jobCount: 0 } };
  }

  const fee = getPlatformFeePct();
  const rows: EarningRow[] = (data ?? []).map((r) => {
    const gross = Number(r.charge_gross ?? 0);
    const tip = Number(r.tip_total ?? 0);
    const refunded = Number(r.refund_total ?? 0) > 0;
    const commission = refunded ? 0 : gross * fee;
    const net = refunded ? tip : gross * (1 - fee) + tip;
    return {
      bookingId: r.booking_id,
      clientName: r.client_name ?? "",
      serviceSlug: r.service_slug,
      date: r.booking_date,
      currency: r.currency,
      gross,
      commission,
      tip,
      net,
      refunded,
    };
  });

  const thisMonth = cdmxMonthFmt.format(new Date());
  const summary = {
    totalNet: rows.reduce((acc, r) => acc + r.net, 0),
    thisMonthNet: rows
      .filter((r) => cdmxMonthFmt.format(new Date(r.date)) === thisMonth)
      .reduce((acc, r) => acc + r.net, 0),
    jobCount: rows.filter((r) => !r.refunded && r.gross > 0).length,
  };

  return { rows, summary };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean. (If `getPlatformFeePct` can't be imported because `stripe/config.ts` is `server-only`, that's fine — `talacheros.ts` is only used server-side. If typecheck complains about the RPC row field types, they come from Task 1's regenerated types; do not loosen.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/talacheros.ts
git commit -m "feat(earnings): getMyEarnings reader (net + summary)"
```

---

## Task 3: i18n — `earnings` namespace + dashboard card keys

**Files:**
- Modify: `messages/es.json`
- Modify: `messages/en.json`

- [ ] **Step 1: Add to `messages/es.json`**

New top-level `"earnings"` object:

```json
"earnings": {
  "title": "Historial de pagos",
  "subtitle": "Lo que has ganado por cada trabajo, ya con la comisión descontada.",
  "total_earned": "Total ganado",
  "this_month": "Este mes",
  "jobs_paid": "Trabajos pagados",
  "col_date": "Fecha",
  "col_client": "Cliente",
  "col_service": "Servicio",
  "col_amount": "Monto",
  "col_commission": "Comisión",
  "col_tip": "Propina",
  "col_net": "Neto",
  "col_status": "Estado",
  "status_paid": "Pagado",
  "status_refunded": "Reembolsado",
  "empty": "Aún no tienes pagos. Cuando completes trabajos, aparecerán aquí."
}
```

Add these keys INSIDE the EXISTING `"dashboard"` object (next to `talachero_schedule_cta`):

```json
"talachero_earnings": "Historial de pagos",
"talachero_earnings_desc": "Revisa lo que has ganado por cada trabajo.",
"talachero_earnings_cta": "Ver pagos"
```

- [ ] **Step 2: Add the mirror to `messages/en.json`**

New `"earnings"` object:

```json
"earnings": {
  "title": "Payment history",
  "subtitle": "What you've earned per job, with the commission already deducted.",
  "total_earned": "Total earned",
  "this_month": "This month",
  "jobs_paid": "Paid jobs",
  "col_date": "Date",
  "col_client": "Client",
  "col_service": "Service",
  "col_amount": "Amount",
  "col_commission": "Commission",
  "col_tip": "Tip",
  "col_net": "Net",
  "col_status": "Status",
  "status_paid": "Paid",
  "status_refunded": "Refunded",
  "empty": "No payments yet. Once you complete jobs, they'll show up here."
}
```

Inside the EXISTING `"dashboard"` object:

```json
"talachero_earnings": "Payment history",
"talachero_earnings_desc": "Review what you've earned per job.",
"talachero_earnings_cta": "View payments"
```

- [ ] **Step 3: Verify parity**

Run:
```bash
node -e "const es=require('./messages/es.json'),en=require('./messages/en.json');const ks=o=>Object.keys(o).sort().join(',');console.log('earnings parity:', ks(es.earnings)===ks(en.earnings));console.log('dashboard cta es/en:', 'talachero_earnings_cta' in es.dashboard, 'talachero_earnings_cta' in en.dashboard);"
```
Expected: `earnings parity: true` and both `true`. Fix JSON (commas) until it passes.

- [ ] **Step 4: Commit**

```bash
git add messages/es.json messages/en.json
git commit -m "i18n(earnings): earnings namespace + dashboard card (es/en)"
```

---

## Task 4: Presentational components — summary tiles + table

**Files:**
- Create: `src/app/[locale]/dashboard/talachero/earnings/earnings-summary.tsx`
- Create: `src/app/[locale]/dashboard/talachero/earnings/earnings-table.tsx`

These are read-only **server** components (no client interactivity). Tiles follow the `dataviz` skill's KPI-tile guidance (grayscale tokens, label + value, accessible).

- [ ] **Step 1: Create `earnings-summary.tsx`**

```tsx
import { getTranslations, getLocale } from "next-intl/server";
import { formatMoney } from "@/lib/format";

export async function EarningsSummary({
  summary,
}: {
  summary: { totalNet: number; thisMonthNet: number; jobCount: number };
}) {
  const t = await getTranslations("earnings");
  const locale = await getLocale();
  const tiles = [
    { label: t("total_earned"), value: formatMoney(summary.totalNet, locale) },
    { label: t("this_month"), value: formatMoney(summary.thisMonthNet, locale) },
    { label: t("jobs_paid"), value: String(summary.jobCount) },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {tiles.map((tile) => (
        <div key={tile.label} className="border-border rounded-lg border p-5">
          <p className="text-text-secondary text-xs font-medium tracking-wider uppercase">
            {tile.label}
          </p>
          <p className="text-text-primary mt-2 text-2xl font-semibold">{tile.value}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `earnings-table.tsx`**

```tsx
import { getTranslations, getLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import type { EarningRow } from "@/lib/data/talacheros";

export async function EarningsTable({ rows }: { rows: EarningRow[] }) {
  const t = await getTranslations("earnings");
  if (rows.length === 0) {
    return <p className="text-text-secondary text-sm">{t("empty")}</p>;
  }
  const locale = await getLocale();
  const ts = await getTranslations("services");
  const dateFmt = new Intl.DateTimeFormat(locale, {
    timeZone: "America/Mexico_City",
    day: "numeric",
    month: "short",
  });
  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="text-text-secondary border-border border-b">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">{t("col_date")}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t("col_client")}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t("col_service")}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t("col_amount")}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t("col_commission")}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t("col_tip")}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t("col_net")}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t("col_status")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.bookingId} className="border-border border-b align-top last:border-0">
              <td className="text-text-secondary px-4 py-3">
                {dateFmt.format(new Date(r.date))}
              </td>
              <td className="text-text-primary px-4 py-3">{r.clientName}</td>
              <td className="text-text-secondary px-4 py-3">{ts(`${r.serviceSlug}.short`)}</td>
              <td className="text-text-primary px-4 py-3">
                {formatMoney(r.gross, locale, r.currency)}
              </td>
              <td className="text-text-secondary px-4 py-3">
                {r.commission > 0 ? `−${formatMoney(r.commission, locale, r.currency)}` : "—"}
              </td>
              <td className="text-text-secondary px-4 py-3">
                {r.tip > 0 ? formatMoney(r.tip, locale, r.currency) : "—"}
              </td>
              <td className="text-text-primary px-4 py-3 font-medium">
                {formatMoney(r.net, locale, r.currency)}
              </td>
              <td className="px-4 py-3">
                <Badge variant="muted">
                  {t(r.refunded ? "status_refunded" : "status_paid")}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean. (`Badge` `variant="muted"` and `formatMoney(amount, locale, currency)` are existing APIs — see `admin/disputes/disputes-table.tsx`. If lint flags formatting, run `pnpm exec prettier --write` on the two new files only.)

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/dashboard/talachero/earnings/earnings-summary.tsx" "src/app/[locale]/dashboard/talachero/earnings/earnings-table.tsx"
git commit -m "feat(earnings): summary tiles + earnings table components"
```

---

## Task 5: Route page + dashboard link card

**Files:**
- Create: `src/app/[locale]/dashboard/talachero/earnings/page.tsx`
- Modify: `src/app/[locale]/dashboard/talachero/page.tsx`

- [ ] **Step 1: Create the route page**

`src/app/[locale]/dashboard/talachero/earnings/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { getAppUser, dashboardPathForRole } from "@/lib/auth";
import { getMyEarnings } from "@/lib/data/talacheros";
import { EarningsSummary } from "./earnings-summary";
import { EarningsTable } from "./earnings-table";

export default async function TalacheroEarningsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await getAppUser();
  if (!user) {
    redirect(`/${locale}/auth/sign-in` as Route);
  }
  if (user.role !== "talachero") {
    redirect(`/${locale}${dashboardPathForRole(user.role)}` as Route);
  }

  const t = await getTranslations("earnings");
  const { rows, summary } = await getMyEarnings();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-text-primary text-2xl font-semibold">{t("title")}</h1>
        <p className="text-text-secondary mt-1 text-sm">{t("subtitle")}</p>
      </div>
      <EarningsSummary summary={summary} />
      <EarningsTable rows={rows} />
    </div>
  );
}
```

- [ ] **Step 2: Add the dashboard link card**

In `src/app/[locale]/dashboard/talachero/page.tsx`, find the grid `<div>` that holds the profile + availability `<Card>`s (the "Still-placeholder tools" / tools grid, `className="grid grid-cols-1 gap-4 md:grid-cols-2"`). Add a third `<Card>` inside that grid, after the availability card:

```tsx
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("talachero_earnings")}</CardTitle>
            <CardDescription>{t("talachero_earnings_desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/dashboard/talachero/earnings"
              className={buttonVariants({ size: "sm" })}
            >
              {t("talachero_earnings_cta")}
            </Link>
          </CardContent>
        </Card>
```

Also change that grid's class from `md:grid-cols-2` to `md:grid-cols-3` so three cards sit evenly. (`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `Link`, `buttonVariants` are already imported in this file — no new imports.)

- [ ] **Step 3: Typecheck + lint + build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: clean; `/[locale]/dashboard/talachero/earnings` appears in the build route list.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/dashboard/talachero/earnings/page.tsx" "src/app/[locale]/dashboard/talachero/page.tsx"
git commit -m "feat(earnings): earnings route + dashboard card"
```

---

## Task 6: Final verification + PR

**Files:** none (verification only)

- [ ] **Step 1: Full static verification**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: all clean; the earnings route present.

- [ ] **Step 2: Browser pass**

Start `pnpm dev` (or reuse the running one). Sign in as a talachero with ledger history (if none, add a `charge`+`tip` via SQL on one of their bookings, or run a payment through the local Stripe flow):
1. Talachero dashboard → the **"Historial de pagos"** card → **Ver pagos**.
2. `/dashboard/talachero/earnings`: the 3 summary tiles show sensible totals; the table lists each booking with **Monto / Comisión (−15%) / Propina / Neto** and a **Pagado**/**Reembolsado** badge; a refunded row shows net 0.
3. Spot-check the math: a CA$560 non-refunded charge → commission CA$84, net CA$476 (+ any tip).
4. A talachero with no ledger rows shows the empty state.
5. Zero console errors.

- [ ] **Step 3: Update HANDOFF + Notion**

Add an earnings section to `HANDOFF.md` (what shipped, the `get_my_earnings` RPC + migration `20260722140001`, net-derived-app-side note, cloud-push reminder). Commit `docs: HANDOFF — talachero earnings view`. Note in Notion that the "historial de pagos" gap from "Diseñar panel del prestador" is now closed.

- [ ] **Step 4: Open the PR**

```bash
git push -u origin feat/talachero-earnings
gh pr create --base main --title "Talachero payment-history (earnings) view (Sprint 2)" \
  --body "Dedicated /dashboard/talachero/earnings page: summary tiles (total/this-month/paid jobs) + per-booking earnings list in net terms (after the 15% commission), over the immutable transactions ledger. New get_my_earnings SECURITY DEFINER RPC; net derived app-side (fee env is server-only). Read-only. Closes the 'historial de pagos' gap. Spec + plan in docs/superpowers/. Verified: typecheck/lint/build + DB-level RPC checks + browser pass.

Note: migration 20260722140001 must be pushed to cloud via 'supabase db push' before the live site shows earnings.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Self-review notes (author)

- **Spec coverage:** RPC aggregation (Task 1) ✓ · reader net/summary (Task 2) ✓ · i18n (Task 3) ✓ · summary tiles + table incl. empty state + refund display (Task 4) ✓ · route + role guard + dashboard card (Task 5) ✓ · verification incl. DB aggregation + self-scoping + net math + browser (Tasks 1, 6) ✓. Non-goals (payout timing, charts, filters, CSV) excluded.
- **Type consistency:** `EarningRow { bookingId, clientName, serviceSlug, date, currency, gross, commission, tip, net, refunded }` (Task 2) consumed unchanged in Task 4's table. `EarningsView.summary { totalNet, thisMonthNet, jobCount }` (Task 2) consumed in Task 4's summary + Task 5's page. RPC OUT columns (`booking_id, client_name, service_slug, booking_date, currency, charge_gross, tip_total, refund_total, last_activity`) match the reader's field reads.
- **Net math is consistent across spec + reader + verification:** `commission = refunded ? 0 : gross×fee`; `net = refunded ? tip : gross×(1−fee) + tip`; `jobCount` counts non-refunded with `gross>0`. 560 → 84 / 476 confirmed in the browser step.
- **No placeholders:** every code step shows complete code; every run step shows the command + expected result.
