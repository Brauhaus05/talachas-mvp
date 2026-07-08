# Phase 6 cycle 3 — Disputes Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a client flag a completed+captured booking as disputed, land it in an admin queue, and let an admin resolve it with a full refund or a dismissal.

**Architecture:** A new `disputes` table with its own status enum, written only through `SECURITY DEFINER` RPCs (`raise_dispute` for the client, `admin_resolve_dispute` + `admin_list_disputes` for the admin) — the exact posture of cycle 1's `create_review` and cycle 2's admin RPCs. The refund resolution reuses the already-built `refundCapturedBooking()` helper; the `charge.refunded` webhook remains the source of truth for `payment_status` + the ledger. UI mirrors cycle 1 (the client review page/CTA) and cycle 2 (the admin table + shared confirm-button).

**Tech Stack:** Next.js 16 (App Router, Server Components + Server Actions) · Supabase Postgres (RLS + `SECURITY DEFINER` RPCs) · Stripe Connect · next-intl · TypeScript strict · pnpm.

**Spec:** `docs/superpowers/specs/2026-07-07-phase6-disputes-queue-design.md`

**Conventions (do not deviate):**
- No test runner. "Verify" = `pnpm typecheck` + `pnpm lint` + secretless `pnpm build`, plus DB/RPC checks run through psql against the local stack.
- Grayscale design tokens only (never hex/rgb); state via icon+text; every visible string through `t()`; `messages/es.json` and `messages/en.json` keep an identical key set.
- Local Supabase db is on **port 55322** (remapped +1000). Get the connection string from `pnpm exec supabase status` (field: `DB URL`), e.g. `postgresql://postgres:postgres@127.0.0.1:55322/postgres`. This plan calls it `$DBURL`.
- **Do NOT `db reset`** (it wipes Carlos's Stripe onboarding). Apply new migrations with `pnpm exec supabase migration up --local`.
- After the schema change, regenerate types: `pnpm exec supabase gen types typescript --local > src/lib/supabase/database.types.ts`.
- Format only files you touch (`pnpm prettier --write <files>`) — repo has prettier drift.

---

## File Structure

**New files:**
- `supabase/migrations/20260707140001_disputes.sql` — enum, table, RLS, revokes, 3 RPCs, `get_my_bookings` rebuild.
- `src/app/[locale]/dashboard/bookings/[id]/dispute/page.tsx` — client dispute-raise page (guarded).
- `src/app/[locale]/dashboard/bookings/[id]/dispute/dispute-form.tsx` — client form (reason textarea).
- `src/app/[locale]/dashboard/bookings/[id]/dispute/actions.ts` — `raiseDispute` server action (co-located, mirrors the review route).
- `src/app/[locale]/dashboard/admin/disputes/page.tsx` — admin queue page (guarded).
- `src/app/[locale]/dashboard/admin/disputes/disputes-table.tsx` — queue table + Refund/Dismiss actions.

**Modified files:**
- `src/lib/supabase/database.types.ts` (regenerated) + `src/lib/supabase/types.ts` (add `DisputeStatus`, `DisputeRow` aliases).
- `src/lib/data/admin.ts` — `AdminDispute` interface + `listDisputes()`.
- `src/lib/data/bookings.ts` — `hasDispute` on `ClientBooking` + mapping.
- `src/app/[locale]/dashboard/admin/actions.ts` — `resolveDispute` server action.
- `src/app/[locale]/dashboard/admin/page.tsx` — fourth overview card (Disputes).
- `src/app/[locale]/dashboard/page.tsx` — "Report a problem" / "Dispute under review" CTA + `disputed=1` banner.
- `messages/es.json` + `messages/en.json` — `disputes` namespace + `admin.disputes*`/`dashboard.dispute*` keys.
- `supabase/seed.sql` — one seeded open dispute.

---

## Task 1: Disputes migration, RPCs, and generated types

**Files:**
- Create: `supabase/migrations/20260707140001_disputes.sql`
- Modify: `src/lib/supabase/database.types.ts` (regen), `src/lib/supabase/types.ts`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260707140001_disputes.sql`:

```sql
-- Phase 6 cycle 3 · Disputes queue.
-- A client flags a completed+captured booking; it lands in an admin queue; the
-- admin resolves it with a full refund or a dismissal. All writes go through
-- SECURITY DEFINER RPCs (mirrors create_review / the cycle-2 admin RPCs). The
-- refund itself is a Stripe call in the server action; the charge.refunded
-- webhook stays the source of truth for payment_status + the ledger.

create type public.dispute_status as enum ('open', 'refunded', 'dismissed');

create table public.disputes (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null unique references public.bookings(id) on delete cascade,
  raised_by   uuid not null references public.users(id) on delete restrict,
  reason      text not null,
  status      public.dispute_status not null default 'open',
  admin_note  text,
  resolved_by uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index disputes_status_idx on public.disputes (status);

-- RLS: a client reads their own disputes (dashboard status); admin reads via the
-- curated RPC below. All writes go through SECURITY DEFINER RPCs only, so INSERT/
-- UPDATE/DELETE are never granted to authenticated (mirrors bookings/reviews).
alter table public.disputes enable row level security;

create policy "clients read their own disputes"
  on public.disputes for select
  using (raised_by = auth.uid());

revoke insert, update, delete on public.disputes from authenticated;

-- ---- raise_dispute (client) ------------------------------------------------
-- Client flags their own completed+captured booking. One dispute per booking
-- (unique booking_id → typed 'already_disputed').
create or replace function public.raise_dispute(
  p_booking_id uuid,
  p_reason     text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_client  uuid;
  v_status  public.booking_status;
  v_pay     text;
  v_dispute uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'empty_reason';
  end if;

  select client_id, status, payment_status
    into v_client, v_status, v_pay
    from bookings
    where id = p_booking_id;

  if not found then
    raise exception 'booking_not_found';
  end if;
  if v_client <> v_uid then
    raise exception 'not_your_booking';
  end if;
  if v_status <> 'completed' then
    raise exception 'booking_not_completed';
  end if;
  if v_pay <> 'captured' then
    raise exception 'not_refundable';
  end if;

  begin
    insert into disputes (booking_id, raised_by, reason)
    values (p_booking_id, v_uid, btrim(p_reason))
    returning id into v_dispute;
  exception when unique_violation then
    raise exception 'already_disputed';
  end;

  return v_dispute;
end;
$$;
grant execute on function public.raise_dispute(uuid, text) to authenticated;

-- ---- admin_list_disputes (admin read) --------------------------------------
-- Curated projection: party names + amount + payment_status live behind users
-- own-row RLS, so expose them here. Open disputes first, then newest.
create or replace function public.admin_list_disputes()
returns table (
  id uuid, booking_id uuid, client_name text, talachero_name text,
  price numeric, currency text, payment_status text, reason text,
  status public.dispute_status, admin_note text,
  created_at timestamptz, resolved_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  return query
    select d.id, d.booking_id, cu.full_name, tu.full_name,
           b.price, b.currency, b.payment_status, d.reason,
           d.status, d.admin_note, d.created_at, d.resolved_at
      from disputes d
      join bookings b on b.id = d.booking_id
      join users cu on cu.id = b.client_id
      join talachero_profiles tp on tp.id = b.talachero_id
      join users tu on tu.id = tp.user_id
     order by (d.status <> 'open'), d.created_at desc;
end;
$$;
grant execute on function public.admin_list_disputes() to authenticated;

-- ---- admin_resolve_dispute (admin write) -----------------------------------
-- Records the operator decision only. The actual Stripe refund is the server
-- action's call; the charge.refunded webhook reconciles payment_status + ledger.
-- Only an 'open' dispute can be resolved (blocks double-submit / races).
create or replace function public.admin_resolve_dispute(
  p_dispute_id uuid,
  p_refunded   boolean,
  p_note       text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.dispute_status;
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  select status into v_status from disputes where id = p_dispute_id;
  if not found then
    raise exception 'dispute_not_found';
  end if;
  if v_status <> 'open' then
    raise exception 'dispute_not_open';
  end if;
  update disputes
     set status      = case when p_refunded then 'refunded' else 'dismissed' end,
         resolved_by = auth.uid(),
         resolved_at = now(),
         admin_note  = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_dispute_id;
end;
$$;
grant execute on function public.admin_resolve_dispute(uuid, boolean, text) to authenticated;

-- ---- get_my_bookings gains has_dispute -------------------------------------
-- So the client dashboard shows "Report a problem" vs "Dispute under review"
-- without a second query. CREATE OR REPLACE can't alter OUT columns → DROP+CREATE.
drop function if exists public.get_my_bookings();

create function public.get_my_bookings()
returns table (
  id             uuid,
  status         public.booking_status,
  payment_status text,
  price          numeric,
  currency       text,
  address        text,
  created_at     timestamptz,
  talachero_id   uuid,
  talachero_name text,
  service_slug   text,
  slot_start     timestamptz,
  has_review     boolean,
  has_dispute    boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id, b.status, b.payment_status, b.price, b.currency, b.address,
    b.created_at, tp.id, tu.full_name, sc.slug, s.start_time,
    exists (select 1 from reviews r
            where r.booking_id = b.id and r.author_id = auth.uid()) as has_review,
    exists (select 1 from disputes d
            where d.booking_id = b.id) as has_dispute
  from bookings b
  join talachero_profiles tp on tp.id = b.talachero_id
  join users tu on tu.id = tp.user_id
  join service_categories sc on sc.id = b.service_category_id
  left join availability_slots s on s.id = b.slot_id
  where b.client_id = auth.uid()
  order by b.created_at desc;
$$;

grant execute on function public.get_my_bookings() to authenticated;
```

- [ ] **Step 2: Apply the migration**

Run: `pnpm exec supabase migration up --local`
Expected: applies `20260707140001_disputes.sql` with no error (prints the migration name; no `ERROR`).

- [ ] **Step 3: Regenerate types and add aliases**

Run: `pnpm exec supabase gen types typescript --local > src/lib/supabase/database.types.ts`

Then edit `src/lib/supabase/types.ts` — add a `DisputeStatus` enum alias after `TransactionType`, and a `DisputeRow` alias after `ReviewRow`:

```ts
export type TransactionType = Database["public"]["Enums"]["transaction_type"];
export type DisputeStatus = Database["public"]["Enums"]["dispute_status"];
```

```ts
export type ReviewRow = Tables["reviews"]["Row"];
export type DisputeRow = Tables["disputes"]["Row"];
```

- [ ] **Step 4: Verify the RPCs at the DB layer**

Get the connection string: `pnpm exec supabase status` → copy `DB URL` into `$DBURL`.

Run this non-destructive verification (sets up test state in a transaction, asserts, then `rollback`s):

```bash
psql "$DBURL" <<'SQL'
begin;
-- Pick a completed booking + its client, and make it captured for the test.
do $$
declare v_bid uuid; v_client uuid; v_admin uuid; v_other uuid; v_did uuid;
begin
  select b.id, b.client_id into v_bid, v_client
    from bookings b where b.status = 'completed' limit 1;
  update bookings set payment_status = 'captured' where id = v_bid;
  select id into v_admin  from users where role = 'admin' limit 1;
  select id into v_other  from users where id <> v_client and role = 'client' limit 1;

  -- CLIENT context
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_client::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- happy path
  v_did := raise_dispute(v_bid, '  Job left a mess  ');
  raise notice 'raised: % (open? %)', v_did,
    (select status from disputes where id = v_did);

  -- duplicate → already_disputed
  begin perform raise_dispute(v_bid, 'again'); raise notice 'FAIL dup';
  exception when others then raise notice 'dup guard: %', sqlerrm; end;

  -- empty reason
  begin perform raise_dispute(v_bid, '   '); raise notice 'FAIL empty';
  exception when others then raise notice 'empty guard: %', sqlerrm; end;

  -- has_dispute flips
  raise notice 'has_dispute: %',
    (select has_dispute from get_my_bookings() where id = v_bid);

  reset role;
  -- OTHER client → not_your_booking (use a fresh, undisputed captured booking)
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_other::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform raise_dispute(v_bid, 'not mine'); raise notice 'FAIL owner';
  exception when others then raise notice 'owner guard: %', sqlerrm; end;
  reset role;

  -- ADMIN context: list + resolve
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  raise notice 'admin sees % dispute(s)', (select count(*) from admin_list_disputes());
  perform admin_resolve_dispute(v_did, false, 'insufficient evidence');
  raise notice 'resolved status: %', (select status from disputes where id = v_did);
  -- re-resolve → dispute_not_open
  begin perform admin_resolve_dispute(v_did, true, null); raise notice 'FAIL reresolve';
  exception when others then raise notice 'reresolve guard: %', sqlerrm; end;
  reset role;

  -- NON-ADMIN resolve → not_authorized
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_client::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform admin_resolve_dispute(v_did, true, null); raise notice 'FAIL nonadmin';
  exception when others then raise notice 'nonadmin guard: %', sqlerrm; end;
  reset role;
end $$;
rollback;
SQL
```

Expected NOTICEs (order): `raised: <uuid> (open? open)`; `dup guard: already_disputed`; `empty guard: empty_reason`; `has_dispute: t`; `owner guard: not_your_booking`; `admin sees 1 dispute(s)`; `resolved status: dismissed`; `reresolve guard: dispute_not_open`; `nonadmin guard: not_authorized`. No line containing `FAIL`.

(The `booking_not_completed` / `not_refundable` guards are covered by the action-layer + page-guard tests; the RPC branches are simple `if` checks verified by reading. If you want them exercised here too, insert a second `do` block picking a non-completed / non-captured booking and asserting the raise fails — optional.)

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors (the regenerated `database.types.ts` now includes `disputes` + `dispute_status`; `types.ts` aliases resolve).

- [ ] **Step 6: Commit**

```bash
pnpm prettier --write src/lib/supabase/types.ts src/lib/supabase/database.types.ts
git add supabase/migrations/20260707140001_disputes.sql src/lib/supabase/database.types.ts src/lib/supabase/types.ts
git commit -m "feat(disputes): schema, RPCs, and has_dispute on get_my_bookings"
```

---

## Task 2: Data layer — listDisputes + hasDispute

**Files:**
- Modify: `src/lib/data/admin.ts`, `src/lib/data/bookings.ts`

- [ ] **Step 1: Add `AdminDispute` + `listDisputes` to admin.ts**

In `src/lib/data/admin.ts`, add the import and interface (after the existing `AdminReview` interface) and the function (after `listReviews`):

```ts
import type { UserRole, DisputeStatus } from "@/lib/supabase/types";
```

```ts
export interface AdminDispute {
  id: string;
  bookingId: string;
  clientName: string;
  talacheroName: string;
  price: number;
  currency: string;
  paymentStatus: string;
  reason: string;
  status: DisputeStatus;
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export async function listDisputes(): Promise<AdminDispute[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_list_disputes");
  return (data ?? []).map((r) => ({
    id: r.id,
    bookingId: r.booking_id,
    clientName: r.client_name ?? "",
    talacheroName: r.talachero_name ?? "",
    price: Number(r.price ?? 0),
    currency: r.currency,
    paymentStatus: r.payment_status,
    reason: r.reason,
    status: r.status,
    adminNote: r.admin_note,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  }));
}
```

(The existing top-of-file import is `import type { UserRole } from "@/lib/supabase/types";` — replace it with the combined import above rather than adding a duplicate line.)

- [ ] **Step 2: Add `hasDispute` to bookings.ts**

In `src/lib/data/bookings.ts`, add `hasDispute: boolean;` to the `ClientBooking` interface (after `hasReview`), and `hasDispute: r.has_dispute,` to the `getMyBookings` mapper (after `hasReview: r.has_review,`).

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors (`r.has_dispute` / `admin_list_disputes` exist in the regenerated types from Task 1).

- [ ] **Step 4: Commit**

```bash
pnpm prettier --write src/lib/data/admin.ts src/lib/data/bookings.ts
git add src/lib/data/admin.ts src/lib/data/bookings.ts
git commit -m "feat(disputes): data-layer listDisputes + hasDispute view fields"
```

---

## Task 3: i18n keys (disputes + admin.disputes + dashboard.dispute*)

**Files:**
- Modify: `messages/es.json`, `messages/en.json`

- [ ] **Step 1: Add the `disputes` namespace (client) to both files**

In `messages/es.json`, add a top-level `"disputes"` object:

```json
  "disputes": {
    "title": "Reportar un problema",
    "subtitle": "Cuéntanos qué salió mal con el servicio de {name}. Un moderador revisará tu caso.",
    "back": "Volver",
    "reason_label": "¿Qué pasó?",
    "reason_placeholder": "Describe el problema con el servicio…",
    "submit": "Enviar reporte",
    "error_not_refundable": "Esta reserva no admite reembolso.",
    "error_already_disputed": "Ya existe un reporte para esta reserva.",
    "error_generic": "No se pudo enviar el reporte. Inténtalo de nuevo."
  }
```

In `messages/en.json`, the same object translated:

```json
  "disputes": {
    "title": "Report a problem",
    "subtitle": "Tell us what went wrong with {name}'s service. A moderator will review your case.",
    "back": "Back",
    "reason_label": "What happened?",
    "reason_placeholder": "Describe the problem with the service…",
    "submit": "Submit report",
    "error_not_refundable": "This booking is not refundable.",
    "error_already_disputed": "A report already exists for this booking.",
    "error_generic": "Could not submit the report. Please try again."
  }
```

- [ ] **Step 2: Add `dashboard.dispute*` keys to both files**

In `messages/es.json` `"dashboard"`, add (near `review_cta` / `reviewed` / `review_success`):

```json
    "dispute_cta": "Reportar un problema",
    "dispute_pending": "Reporte en revisión",
    "dispute_success": "Tu reporte se envió. Un moderador lo revisará.",
```

In `messages/en.json` `"dashboard"`:

```json
    "dispute_cta": "Report a problem",
    "dispute_pending": "Report under review",
    "dispute_success": "Your report was submitted. A moderator will review it.",
```

- [ ] **Step 3: Add `admin.disputes*` keys to both files**

In `messages/es.json` `"admin"`, add:

```json
    "nav_disputes": "Disputas",
    "nav_disputes_desc": "Revisa y resuelve reportes de clientes.",
    "disputes_title": "Disputas",
    "col_reason": "Motivo",
    "col_status": "Estado",
    "col_date": "Fecha",
    "action_dismiss": "Descartar",
    "status_open": "Abierta",
    "status_refunded": "Reembolsada",
    "status_dismissed": "Descartada",
```

In `messages/en.json` `"admin"`:

```json
    "nav_disputes": "Disputes",
    "nav_disputes_desc": "Review and resolve client reports.",
    "disputes_title": "Disputes",
    "col_reason": "Reason",
    "col_status": "Status",
    "col_date": "Date",
    "action_dismiss": "Dismiss",
    "status_open": "Open",
    "status_refunded": "Refunded",
    "status_dismissed": "Dismissed",
```

- [ ] **Step 4: Verify the two files have an identical key set**

Run:
```bash
node -e "const a=require('./messages/es.json'),b=require('./messages/en.json');const flat=(o,p='')=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==='object'?flat(v,p+k+'.'):[p+k]);const A=new Set(flat(a)),B=new Set(flat(b));const only=(x,y)=>[...x].filter(k=>!y.has(k));console.log('es-only:',only(A,B));console.log('en-only:',only(B,A));"
```
Expected: `es-only: []` and `en-only: []`.

- [ ] **Step 5: Commit**

```bash
pnpm prettier --write messages/es.json messages/en.json
git add messages/es.json messages/en.json
git commit -m "feat(disputes): i18n keys (client + admin, es/en in sync)"
```

---

## Task 4: Client dispute page, form, and action

**Files:**
- Create: `src/app/[locale]/dashboard/bookings/[id]/dispute/actions.ts`, `dispute-form.tsx`, `page.tsx`

- [ ] **Step 1: Write the server action**

Create `src/app/[locale]/dashboard/bookings/[id]/dispute/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

export type DisputeState = { error?: string };

/** Map raise_dispute's raised codes to a known, translatable set; anything
 * unexpected collapses to "generic". Mirrors mapReviewError(). */
function mapDisputeError(message: string): string {
  const known = [
    "not_refundable",
    "already_disputed",
    "booking_not_completed",
    "not_your_booking",
    "booking_not_found",
    "empty_reason",
    "not_authenticated",
  ];
  const m = message.toLowerCase();
  return known.find((code) => m.includes(code)) ?? "generic";
}

/** Client raises a dispute on a completed+captured booking. On success:
 * redirect to the dashboard with ?disputed=1. On failure: return a typed error
 * code the form localizes (only not_refundable / already_disputed / generic are
 * reachable once the page guard has passed). */
export async function raiseDispute(
  _prev: DisputeState,
  formData: FormData
): Promise<DisputeState> {
  const bookingId = String(formData.get("bookingId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const locale = await getLocale();

  if (reason.trim() === "") {
    return { error: "empty_reason" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("raise_dispute", {
    p_booking_id: bookingId,
    p_reason: reason,
  });

  if (error) {
    return { error: mapDisputeError(error.message) };
  }

  revalidatePath(`/${locale}/dashboard`);
  redirect(`/${locale}/dashboard?disputed=1` as Route);
}
```

- [ ] **Step 2: Write the form**

Create `src/app/[locale]/dashboard/bookings/[id]/dispute/dispute-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { raiseDispute, type DisputeState } from "./actions";

const ERROR_KEYS: Record<string, string> = {
  not_refundable: "error_not_refundable",
  already_disputed: "error_already_disputed",
};

export function DisputeForm({ bookingId }: { bookingId: string }) {
  const t = useTranslations("disputes");
  const [state, formAction, pending] = useActionState<DisputeState, FormData>(
    raiseDispute,
    {}
  );

  const errorMsg = state.error
    ? t(ERROR_KEYS[state.error] ?? "error_generic")
    : null;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="bookingId" value={bookingId} />

      <label className="flex flex-col gap-2">
        <span className="text-text-secondary text-sm font-medium">
          {t("reason_label")}
        </span>
        <textarea
          name="reason"
          rows={5}
          required
          placeholder={t("reason_placeholder")}
          className="border-border-strong bg-surface text-text-primary rounded-md border px-3 py-2 text-sm"
        />
      </label>

      {errorMsg && (
        <p role="alert" className="text-text-primary text-sm">
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-action-primary text-text-inverse hover:bg-action-primary-hover w-fit rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        {t("submit")}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Write the page (guarded)**

Create `src/app/[locale]/dashboard/bookings/[id]/dispute/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getAppUser } from "@/lib/auth";
import { getMyBookings } from "@/lib/data/bookings";
import { DisputeForm } from "./dispute-form";

export default async function DisputePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const user = await getAppUser();
  if (!user) {
    redirect(`/${locale}/auth/sign-in` as Route);
  }

  // Only the booking's client, only completed + captured + not already disputed.
  const booking = (await getMyBookings()).find((b) => b.id === id);
  if (
    !booking ||
    booking.status !== "completed" ||
    booking.paymentStatus !== "captured" ||
    booking.hasDispute
  ) {
    notFound();
  }

  const t = await getTranslations("disputes");

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <Link
          href={"/dashboard" as Route}
          className="text-text-secondary hover:text-text-primary mb-4 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t("back")}
        </Link>
        <h1 className="text-text-primary text-2xl font-semibold">{t("title")}</h1>
        <p className="text-text-secondary mt-1 text-sm">
          {t("subtitle", { name: booking.talacheroName ?? "" })}
        </p>
      </div>
      <DisputeForm bookingId={booking.id} />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
pnpm prettier --write "src/app/[locale]/dashboard/bookings/[id]/dispute/actions.ts" "src/app/[locale]/dashboard/bookings/[id]/dispute/dispute-form.tsx" "src/app/[locale]/dashboard/bookings/[id]/dispute/page.tsx"
git add "src/app/[locale]/dashboard/bookings/[id]/dispute"
git commit -m "feat(disputes): client dispute-raise page, form, and action"
```

---

## Task 5: Client dashboard CTA + success banner

**Files:**
- Modify: `src/app/[locale]/dashboard/page.tsx`

- [ ] **Step 1: Add `disputed` to the banner**

In `src/app/[locale]/dashboard/page.tsx`, extend the searchParams destructure (line ~30):

```tsx
  const { booked, paid, tipped, reviewed, disputed } = await searchParams;
```

Update the banner condition and message (the `(booked || paid || tipped || reviewed)` block):

```tsx
      {(booked || paid || tipped || reviewed || disputed) && (
        <div
          role="status"
          className="border-border-strong bg-surface-muted text-text-primary flex items-start gap-3 rounded-md border px-4 py-3 text-sm"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {disputed
              ? t("dispute_success")
              : reviewed
                ? t("review_success")
                : paid
                  ? t("paid_success")
                  : tipped
                    ? t("tip_success")
                    : t("booking_success")}
          </span>
        </div>
      )}
```

- [ ] **Step 2: Add the "Report a problem" / "Dispute under review" control**

In the `b.status === "completed"` action block, inside the `<div className="flex flex-col gap-2">` that already holds the tip form + review CTA, add a dispute control **after** the review `{b.hasReview ? … : …}` block (still inside that div). It shows only for captured bookings:

```tsx
                    {b.paymentStatus === "captured" &&
                      (b.hasDispute ? (
                        <span className="text-text-secondary text-xs">
                          {t("dispute_pending")}
                        </span>
                      ) : (
                        <Link
                          href={`/dashboard/bookings/${b.id}/dispute` as Route}
                          className="border-border-strong text-text-primary hover:bg-surface-muted w-fit rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
                        >
                          {t("dispute_cta")}
                        </Link>
                      ))}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
pnpm prettier --write "src/app/[locale]/dashboard/page.tsx"
git add "src/app/[locale]/dashboard/page.tsx"
git commit -m "feat(disputes): client dashboard CTA + disputed success banner"
```

---

## Task 6: Admin resolve action + queue page + table + overview card

**Files:**
- Modify: `src/app/[locale]/dashboard/admin/actions.ts`, `src/app/[locale]/dashboard/admin/page.tsx`
- Create: `src/app/[locale]/dashboard/admin/disputes/page.tsx`, `disputes-table.tsx`

- [ ] **Step 1: Add `resolveDispute` to admin actions**

In `src/app/[locale]/dashboard/admin/actions.ts`, append (the imports `getLocale`, `createClient`, `createServiceClient`, `getAppUser`, `refundCapturedBooking`, `revalidatePath` are already imported at the top of the file):

```ts
/** Resolve a dispute. `action` is "refund" or "dismiss". Admin-only (this reads
 * via the service client for the refund lookup, so the role check is the gate).
 * Refund path: best-effort Stripe refund via the shared helper (charge.refunded
 * webhook reconciles payment_status + ledger), then record the decision. Dismiss
 * path: record only. admin_resolve_dispute rejects a non-open dispute. */
export async function resolveDispute(formData: FormData) {
  const disputeId = String(formData.get("disputeId") ?? "");
  const action = String(formData.get("action") ?? "");
  const user = await getAppUser();
  if (user?.role !== "admin") return;

  const refunded = action === "refund";

  if (refunded) {
    const service = createServiceClient();
    const { data: dispute } = await service
      .from("disputes")
      .select("booking_id")
      .eq("id", disputeId)
      .maybeSingle();
    if (dispute?.booking_id) {
      const { data: booking } = await service
        .from("bookings")
        .select("stripe_payment_intent_id, payment_status")
        .eq("id", dispute.booking_id)
        .maybeSingle();
      if (booking?.payment_status === "captured" && booking.stripe_payment_intent_id) {
        try {
          await refundCapturedBooking(booking.stripe_payment_intent_id);
        } catch {
          // best-effort; webhook remains the source of truth
        }
      }
    }
  }

  const supabase = await createClient();
  await supabase.rpc("admin_resolve_dispute", {
    p_dispute_id: disputeId,
    p_refunded: refunded,
  });
  revalidatePath(`/${await getLocale()}/dashboard/admin/disputes`);
}
```

- [ ] **Step 2: Write the disputes table**

Create `src/app/[locale]/dashboard/admin/disputes/disputes-table.tsx`:

```tsx
import { getTranslations, getLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import type { AdminDispute } from "@/lib/data/admin";
import { resolveDispute } from "../actions";
import { ConfirmButton } from "../confirm-button";

export async function DisputesTable({ disputes }: { disputes: AdminDispute[] }) {
  const t = await getTranslations("admin");
  if (disputes.length === 0) {
    return <p className="text-text-secondary text-sm">{t("empty")}</p>;
  }
  const locale = await getLocale();
  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="text-text-secondary border-border border-b">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">{t("col_client")}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t("col_talachero")}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t("col_amount")}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t("col_reason")}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t("col_status")}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t("col_actions")}</th>
          </tr>
        </thead>
        <tbody>
          {disputes.map((d) => (
            <tr key={d.id} className="border-border border-b last:border-0 align-top">
              <td className="text-text-primary px-4 py-3">{d.clientName}</td>
              <td className="text-text-primary px-4 py-3">{d.talacheroName}</td>
              <td className="text-text-primary px-4 py-3">
                {formatMoney(d.price, locale, d.currency)}
              </td>
              <td className="text-text-secondary max-w-xs px-4 py-3">{d.reason}</td>
              <td className="px-4 py-3">
                <Badge variant="muted">{t(`status_${d.status}`)}</Badge>
              </td>
              <td className="px-4 py-3">
                {d.status === "open" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={resolveDispute}>
                      <input type="hidden" name="disputeId" value={d.id} />
                      <input type="hidden" name="action" value="refund" />
                      <ConfirmButton label={t("action_refund")} tone="danger" />
                    </form>
                    <form action={resolveDispute}>
                      <input type="hidden" name="disputeId" value={d.id} />
                      <input type="hidden" name="action" value="dismiss" />
                      <ConfirmButton label={t("action_dismiss")} tone="neutral" />
                    </form>
                  </div>
                ) : (
                  <span className="text-text-muted text-xs">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Write the queue page (guarded)**

Create `src/app/[locale]/dashboard/admin/disputes/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import type { Route } from "next";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getAppUser, dashboardPathForRole } from "@/lib/auth";
import { listDisputes } from "@/lib/data/admin";
import { DisputesTable } from "./disputes-table";

export default async function AdminDisputesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await getAppUser();
  if (!user) redirect(`/${locale}/auth/sign-in` as Route);
  if (user.role !== "admin") {
    redirect(`/${locale}${dashboardPathForRole(user.role)}` as Route);
  }

  const t = await getTranslations("admin");
  const disputes = await listDisputes();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={"/dashboard/admin" as Route}
          className="text-text-secondary hover:text-text-primary mb-4 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t("back")}
        </Link>
        <h1 className="text-text-primary text-2xl font-semibold">{t("disputes_title")}</h1>
      </div>
      <DisputesTable disputes={disputes} />
    </div>
  );
}
```

- [ ] **Step 4: Add the fourth overview card**

In `src/app/[locale]/dashboard/admin/page.tsx`, add a fourth entry to the `cards` array (after the reviews card) and widen the grid to 4 columns. Replace the `md:grid-cols-3` on the cards grid with `md:grid-cols-2 lg:grid-cols-4`:

```tsx
    {
      href: "/dashboard/admin/reviews" as Route,
      title: t("nav_reviews"),
      desc: t("nav_reviews_desc"),
    },
    {
      href: "/dashboard/admin/disputes" as Route,
      title: t("nav_disputes"),
      desc: t("nav_disputes_desc"),
    },
```

```tsx
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
pnpm prettier --write "src/app/[locale]/dashboard/admin/actions.ts" "src/app/[locale]/dashboard/admin/page.tsx" "src/app/[locale]/dashboard/admin/disputes/page.tsx" "src/app/[locale]/dashboard/admin/disputes/disputes-table.tsx"
git add "src/app/[locale]/dashboard/admin/actions.ts" "src/app/[locale]/dashboard/admin/page.tsx" "src/app/[locale]/dashboard/admin/disputes"
git commit -m "feat(disputes): admin resolve action, queue page + table, overview card"
```

---

## Task 7: Seed one open dispute

**Files:**
- Modify: `supabase/seed.sql`

- [ ] **Step 1: Add a seeded dispute inside the `DO` block**

In `supabase/seed.sql`, just before the `-- Platform admin.` section (i.e. after the reviews `end loop;` on line ~197), add a block that marks one demo completed booking as captured and inserts an open dispute on it (direct insert — the seed runs as superuser, bypassing the RPC gate). It reuses the loop-local `b_id`? No — `b_id` is overwritten each iteration; instead select a concrete completed booking by its client/talachero:

```sql
  -- -------------------------------------------------------------------------
  -- One open dispute so the admin queue renders without Stripe. Direct insert
  -- (seed runs as superuser, not through raise_dispute); mark the booking
  -- captured so it reads as refundable context in the queue.
  -- -------------------------------------------------------------------------
  select b.id into b_id
    from public.bookings b
    join public.users cu on cu.id = b.client_id
    where cu.email = 'mariana.ruiz@demo.talachas.mx' and b.status = 'completed'
    order by b.created_at desc
    limit 1;
  if b_id is not null then
    update public.bookings set payment_status = 'captured' where id = b_id;
    insert into public.disputes (booking_id, raised_by, reason)
    select b_id, b.client_id, 'El trabajo quedó incompleto y no respondió mis mensajes.'
      from public.bookings b where b.id = b_id;
  end if;
```

(`b_id` is already declared in the `DO` block's `declare` — it's used by the reviews loop. Reusing it here is fine since the loop has ended.)

- [ ] **Step 2: Verify the seed block is syntactically valid without a full reset**

A full `db reset` is disallowed (wipes Stripe onboarding). Instead, dry-check the new statements against the live DB in a rolled-back transaction:

```bash
psql "$DBURL" <<'SQL'
begin;
do $$
declare b_id uuid;
begin
  select b.id into b_id
    from public.bookings b
    join public.users cu on cu.id = b.client_id
    where cu.email = 'mariana.ruiz@demo.talachas.mx' and b.status = 'completed'
    order by b.created_at desc limit 1;
  if b_id is not null then
    update public.bookings set payment_status = 'captured' where id = b_id;
    insert into public.disputes (booking_id, raised_by, reason)
    select b_id, b.client_id, 'seed check'
      from public.bookings b where b.id = b_id;
    raise notice 'seed dispute ok for booking %', b_id;
  else
    raise notice 'no completed booking for mariana (expected on a non-reset db)';
  end if;
end $$;
rollback;
SQL
```

Expected: `NOTICE: seed dispute ok for booking <uuid>` (or the "no completed booking" notice if this session's data differs — either is a pass; the point is no SQL error). The `rollback` leaves the DB untouched.

- [ ] **Step 3: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat(disputes): seed one open dispute for the admin queue"
```

---

## Task 8: Whole-feature verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: both clean, no errors.

- [ ] **Step 2: Secretless production build**

Move `.env.local` aside so the build proves lazy-config still holds, then restore it:

```bash
mv .env.local .env.local.bak && pnpm build; mv .env.local.bak .env.local
```
Expected: build succeeds; the route list includes `/[locale]/dashboard/admin/disputes` and `/[locale]/dashboard/bookings/[id]/dispute`.

- [ ] **Step 3: Route guards (signed-out)**

With the dev server running (`pnpm dev`), confirm the admin queue redirects a signed-out request:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -L --max-redirs 0 http://localhost:3000/es/dashboard/admin/disputes
```
Expected: `307` (redirect to sign-in), not `500`.

- [ ] **Step 4: Re-run the Task 1 DB verification**

Re-run the psql verification block from Task 1 Step 4 to confirm the full RPC surface still passes end-to-end after all tasks. Expected: same NOTICEs, no `FAIL`.

- [ ] **Step 5: Update HANDOFF.md**

Add a "Phase 6 cycle 3 — what shipped (disputes queue)" section mirroring the cycle-2 entry: the `disputes` table + `dispute_status` enum, the 3 RPCs, `has_dispute` on `get_my_bookings`, the client CTA → dispute page, the admin queue + resolve (refund via the shared `refundCapturedBooking` helper / dismiss), the seeded dispute, and the verification state (DB layer + build + guards green; live resolve-with-refund an owner runbook needing Stripe keys + a re-onboarded talachero + a captured booking). Update the phase table row and the "What to say to Claude next session" block. Commit:

```bash
git add HANDOFF.md
git commit -m "docs: HANDOFF — Phase 6 cycle 3 disputes queue built"
```

- [ ] **Step 6: Open the PR** (only when the user asks to)

```bash
git push -u origin feat/phase6-disputes-queue
gh pr create --title "Phase 6 (cycle 3) — Disputes queue" --body "<summary + verification>"
```

---

## Self-Review Notes (author checklist — completed)

- **Spec coverage:** table+enum+RLS+revokes+3 RPCs+`has_dispute` (Task 1); data layer (Task 2); i18n (Task 3); client page/form/action + 404 guards (Task 4); client CTA + banner (Task 5); admin action/queue/table/overview + resolve-with-refund data flow (Task 6); seed (Task 7); typecheck/lint/secretless-build/route-guards/DB verification (Task 8). All spec sections mapped.
- **Refinement vs spec:** `raiseDispute` is co-located in the dispute route folder (`bookings/[id]/dispute/actions.ts`), not `dashboard/actions.ts` — matches the cycle-1 review-route precedent exactly. Noted in the file structure.
- **Type consistency:** `AdminDispute`/`listDisputes`, `DisputeState`/`raiseDispute`, `resolveDispute`, `hasDispute`, `DisputeStatus`/`DisputeRow` names are used identically across the tasks that define and consume them. The `admin.status_${d.status}` keys (`status_open/refunded/dismissed`) match the enum values from Task 1 and the i18n keys from Task 3.
- **No placeholders:** every code step shows complete code; the migration timestamp is concrete (`20260707140001`).
```
