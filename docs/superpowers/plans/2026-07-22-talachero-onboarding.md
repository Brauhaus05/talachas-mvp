# Self-Service Talachero Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a new talachero a guided, admin-reviewed path to go live — a dashboard onboarding checklist + submit-for-review, and an admin approval queue.

**Architecture:** Adds an `in_review` state to `verification_status` and two profile columns (`rejection_reason`, `submitted_at`); three `SECURITY DEFINER` RPCs (talachero submit, admin list, admin approve/reject) gate the transitions; Stripe stops auto-verifying (admin approval is now the sole path to `verified`). A talachero-side checklist reuses the existing profile/availability editors; an admin queue mirrors the disputes queue.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), React 19, next-intl, Supabase (Postgres RPC + RLS), TypeScript strict, Tailwind v4, pnpm.

**Repo testing reality:** no unit-test runner. "Test" per task = `pnpm typecheck` + `pnpm lint` clean (and DB-level SQL via the auth-simulation recipe for the migration). Commit after every task. Branch: already on `feat/talachero-onboarding` (spec committed there). Local Supabase stack is running.

**Spec:** `docs/superpowers/specs/2026-07-22-talachero-onboarding-design.md`

---

## File Structure

- **Create** `supabase/migrations/20260722130001_verification_in_review_enum.sql` — enum ADD VALUE (isolated).
- **Create** `supabase/migrations/20260722130002_talachero_onboarding.sql` — columns + 3 RPCs.
- **Modify** `src/lib/supabase/database.types.ts` — regenerated.
- **Modify** `src/app/api/stripe/webhook/route.ts` — stop writing `verification_status`.
- **Modify** `src/app/[locale]/dashboard/talachero/payment-actions.ts` — stop writing `verification_status`.
- **Modify** `src/lib/data/talacheros.ts` — `getMyOnboardingStatus()`.
- **Modify** `src/lib/data/admin.ts` — `AdminVerification` + `getVerificationQueue()`.
- **Create** `src/app/[locale]/dashboard/talachero/onboarding-actions.ts` — `submitForReview`.
- **Modify** `src/app/[locale]/dashboard/admin/actions.ts` — `approveTalachero` / `rejectTalachero`.
- **Modify** `messages/es.json` + `messages/en.json` — `onboarding` + `admin.verifications`/nav keys.
- **Create** `src/app/[locale]/dashboard/talachero/onboarding-checklist.tsx` — checklist client component.
- **Modify** `src/app/[locale]/dashboard/talachero/page.tsx` — render the checklist.
- **Create** `src/app/[locale]/dashboard/admin/verifications/page.tsx` — admin queue route.
- **Create** `src/app/[locale]/dashboard/admin/verifications/verifications-table.tsx` — queue table.
- **Create** `src/app/[locale]/dashboard/admin/verifications/reject-form.tsx` — reject-with-reason control.
- **Modify** `src/app/[locale]/dashboard/admin/page.tsx` — 5th overview card.

---

## Task 1: Database — enum value, columns, and the three RPCs

**Files:**
- Create: `supabase/migrations/20260722130001_verification_in_review_enum.sql`
- Create: `supabase/migrations/20260722130002_talachero_onboarding.sql`
- Modify (generated): `src/lib/supabase/database.types.ts`

**Prerequisite:** local Supabase stack running (`pnpm exec supabase status`). Use `migration up`, never `db reset`.

- [ ] **Step 1: Write migration A (enum value, isolated)**

Create `supabase/migrations/20260722130001_verification_in_review_enum.sql`:

```sql
-- Self-service talachero onboarding (Sprint 2) — part 1 of 2.
-- Adds the 'in_review' state to verification_status. MUST be its own migration
-- file: Postgres forbids USING a newly-added enum value in the same transaction
-- it was added in, and the CLI runs each migration file in its own transaction.
alter type public.verification_status add value if not exists 'in_review';
```

- [ ] **Step 2: Write migration B (columns + RPCs)**

Create `supabase/migrations/20260722130002_talachero_onboarding.sql`:

```sql
-- Self-service talachero onboarding (Sprint 2) — part 2 of 2.
-- Admin-review gate: talachero completes profile + availability, submits, an
-- admin approves (-> verified, shows in directory) or rejects (-> rejected +
-- reason, can re-submit). All transitions go through SECURITY DEFINER RPCs
-- (verification columns are REVOKE UPDATE from authenticated). Mirrors the
-- disputes queue (raise_dispute / admin_list_disputes / admin_resolve_dispute).

alter table public.talachero_profiles
  add column if not exists rejection_reason text,
  add column if not exists submitted_at    timestamptz;

-- ---- submit_talachero_for_review (talachero) --------------------------------
-- Caller submits their own profile for review. Requires a complete profile
-- (rate + >=1 service) and >=1 upcoming open slot. Only pending/rejected can
-- submit (idempotency + no re-submitting an in_review/verified profile).
create or replace function public.submit_talachero_for_review()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_status  public.verification_status;
  v_rate    numeric;
begin
  select id, verification_status, hourly_rate
    into v_id, v_status, v_rate
    from public.talachero_profiles
    where user_id = auth.uid();
  if v_id is null then
    raise exception 'not_authorized';
  end if;

  if v_status = 'in_review' then
    raise exception 'already_submitted';
  end if;
  if v_status = 'verified' then
    raise exception 'already_verified';
  end if;

  -- profile complete: rate set AND at least one service
  if v_rate is null
     or not exists (select 1 from public.talachero_services ts
                    where ts.talachero_id = v_id) then
    raise exception 'profile_incomplete';
  end if;

  -- availability: at least one upcoming open slot
  if not exists (select 1 from public.availability_slots s
                 where s.talachero_id = v_id
                   and s.status = 'open'
                   and s.start_time >= now()) then
    raise exception 'no_availability';
  end if;

  update public.talachero_profiles
     set verification_status = 'in_review',
         submitted_at        = now(),
         rejection_reason    = null
   where id = v_id;
end;
$$;
revoke all on function public.submit_talachero_for_review() from public;
grant execute on function public.submit_talachero_for_review() to authenticated;

-- ---- admin_list_verifications (admin read) ---------------------------------
-- Curated projection of in_review talacheros: name/bio live behind users
-- own-row RLS, so expose safe fields here. Oldest submission first.
create or replace function public.admin_list_verifications()
returns table (
  talachero_id    uuid,
  full_name       text,
  bio             text,
  hourly_rate     numeric,
  currency        text,
  service_slugs   text[],
  slot_count      bigint,
  charges_enabled boolean,
  submitted_at    timestamptz
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
    select tp.id, tu.full_name, tp.bio, tp.hourly_rate, tp.currency,
           coalesce(array_agg(sc.slug order by sc.slug)
                    filter (where sc.slug is not null), '{}') as service_slugs,
           (select count(*) from public.availability_slots s
             where s.talachero_id = tp.id
               and s.status = 'open' and s.start_time >= now()) as slot_count,
           tp.charges_enabled,
           tp.submitted_at
      from public.talachero_profiles tp
      join public.users tu on tu.id = tp.user_id
      left join public.talachero_services ts on ts.talachero_id = tp.id
      left join public.service_categories sc on sc.id = ts.service_category_id
     where tp.verification_status = 'in_review'
     group by tp.id, tu.full_name, tp.bio, tp.hourly_rate, tp.currency,
              tp.charges_enabled, tp.submitted_at
     order by tp.submitted_at asc;
end;
$$;
grant execute on function public.admin_list_verifications() to authenticated;

-- ---- admin_review_talachero (admin write) ----------------------------------
-- Approve (-> verified) or reject (-> rejected + reason). FOR UPDATE + the
-- in_review guard so two admins can't double-review. Reject requires a reason.
create or replace function public.admin_review_talachero(
  p_talachero_id uuid,
  p_approve      boolean,
  p_reason       text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.verification_status;
  v_reason text;
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  select verification_status into v_status
    from public.talachero_profiles
    where id = p_talachero_id
    for update;
  if not found then
    raise exception 'talachero_not_found';
  end if;
  if v_status <> 'in_review' then
    raise exception 'not_in_review';
  end if;

  if p_approve then
    update public.talachero_profiles
       set verification_status = 'verified',
           rejection_reason    = null
     where id = p_talachero_id;
  else
    v_reason := nullif(btrim(coalesce(p_reason, '')), '');
    if v_reason is null then
      raise exception 'empty_reason';
    end if;
    update public.talachero_profiles
       set verification_status = 'rejected',
           rejection_reason    = v_reason
     where id = p_talachero_id;
  end if;
end;
$$;
grant execute on function public.admin_review_talachero(uuid, boolean, text) to authenticated;
```

- [ ] **Step 3: Apply the migrations**

Run: `pnpm exec supabase migration up --local`
Expected: applies `20260722130001` then `20260722130002` with no error. If it errors on the enum being "unsafe to use", confirm the two are separate files (they must be).

- [ ] **Step 4: DB-level verification (auth-sim, rolled back)**

Write to a scratchpad file and run with `docker exec -i supabase_db_talachas-mvp psql -U postgres -f -` (there is no local `psql` binary; pipe the file in via `docker exec -i ... < file`). SQL:

```sql
begin;
-- an admin + a talachero to impersonate
select id as admin_user from public.users where role='admin' limit 1 \gset
select tp.id as tp_id, tp.user_id as tal_user
  from public.talachero_profiles tp limit 1 \gset

-- Force a clean pending profile with a complete profile + one upcoming slot.
update public.talachero_profiles
  set verification_status='pending', hourly_rate=200, submitted_at=null, rejection_reason=null
  where id=:'tp_id';
insert into public.availability_slots (talachero_id, start_time, end_time, status)
  values (:'tp_id', now()+interval '1 day', now()+interval '1 day 1 hour', 'open')
  on conflict do nothing;

-- (a) profile_incomplete: null the rate -> submit fails
update public.talachero_profiles set hourly_rate=null where id=:'tp_id';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'tal_user','role','authenticated')::text, true);
do $$ begin perform public.submit_talachero_for_review();
  raise exception 'should fail'; exception when others then raise notice 'no rate -> %', sqlerrm; end $$;

-- restore rate, (b) happy path -> in_review
reset role;
update public.talachero_profiles set hourly_rate=200 where id=:'tp_id';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'tal_user','role','authenticated')::text, true);
select public.submit_talachero_for_review();
reset role;
select verification_status, submitted_at is not null as has_ts
  from public.talachero_profiles where id=:'tp_id';  -- expect in_review, true

-- (c) already_submitted
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'tal_user','role','authenticated')::text, true);
do $$ begin perform public.submit_talachero_for_review();
  raise exception 'should fail'; exception when others then raise notice 're-submit -> %', sqlerrm; end $$;

-- (d) admin_list_verifications returns the row (as admin)
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin_user','role','authenticated')::text, true);
select talachero_id, full_name, slot_count from public.admin_list_verifications() where talachero_id=:'tp_id';

-- (e) reject with empty reason fails; with reason -> rejected + reason
do $$ begin perform public.admin_review_talachero(:'tp_id'::uuid, false, '  ');
  raise exception 'should fail'; exception when others then raise notice 'empty reason -> %', sqlerrm; end $$;
select public.admin_review_talachero(:'tp_id'::uuid, false, 'Falta foto de perfil');
reset role;
select verification_status, rejection_reason from public.talachero_profiles where id=:'tp_id'; -- rejected, reason

-- (f) re-review a non-in_review -> not_in_review
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin_user','role','authenticated')::text, true);
do $$ begin perform public.admin_review_talachero(:'tp_id'::uuid, true, null);
  raise exception 'should fail'; exception when others then raise notice 're-review -> %', sqlerrm; end $$;

-- (g) non-admin calls admin RPC -> not_authorized
select set_config('request.jwt.claims', json_build_object('sub', :'tal_user','role','authenticated')::text, true);
do $$ begin perform public.admin_list_verifications();
  raise exception 'should fail'; exception when others then raise notice 'non-admin list -> %', sqlerrm; end $$;

rollback;
```

Expected NOTICEs: `no rate -> profile_incomplete`, `re-submit -> already_submitted`, `empty reason -> empty_reason`, `re-review -> not_in_review`, `non-admin list -> not_authorized`; the happy-path select shows `in_review | t`; the reject select shows `rejected | Falta foto de perfil`. If any differ, STOP and report BLOCKED with the output.

- [ ] **Step 5: Regenerate types + typecheck**

Run: `pnpm exec supabase gen types typescript --local > src/lib/supabase/database.types.ts`
Then: `grep -c "submit_talachero_for_review\|admin_list_verifications\|admin_review_talachero" src/lib/supabase/database.types.ts` → expect non-zero. Also confirm `grep -c "in_review" src/lib/supabase/database.types.ts` is non-zero.
Run: `pnpm typecheck` → clean.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260722130001_verification_in_review_enum.sql supabase/migrations/20260722130002_talachero_onboarding.sql src/lib/supabase/database.types.ts
git commit -m "feat(onboarding): in_review state + submit/admin-review RPCs"
```

---

## Task 2: Decouple Stripe from verification

**Files:**
- Modify: `src/app/api/stripe/webhook/route.ts` (the `account.updated` case, ~line 65–77)
- Modify: `src/app/[locale]/dashboard/talachero/payment-actions.ts` (the `refreshOnboarding` update, ~line 93–101)

- [ ] **Step 1: Webhook — stop writing verification_status**

In `src/app/api/stripe/webhook/route.ts`, change the `account.updated` update from:

```ts
      await service
        .from("talachero_profiles")
        .update({
          charges_enabled: charges,
          payouts_enabled: payouts,
          verification_status: charges && payouts ? "verified" : "pending",
        })
        .eq("stripe_account_id", account.id);
```

to:

```ts
      // Stripe onboarding sets payment readiness only. Directory verification is
      // admin-driven (submit_talachero_for_review -> admin_review_talachero),
      // so we no longer touch verification_status here.
      await service
        .from("talachero_profiles")
        .update({
          charges_enabled: charges,
          payouts_enabled: payouts,
        })
        .eq("stripe_account_id", account.id);
```

- [ ] **Step 2: payment-actions — stop writing verification_status**

In `src/app/[locale]/dashboard/talachero/payment-actions.ts`, change the `refreshOnboarding` update from:

```ts
    await createServiceClient()
      .from("talachero_profiles")
      .update({
        charges_enabled: charges,
        payouts_enabled: payouts,
        verification_status: charges && payouts ? "verified" : "pending",
      })
      .eq("id", profile.id);
```

to:

```ts
    // Payment readiness only; directory verification is admin-driven (see the
    // onboarding review flow), so we no longer set verification_status here.
    await createServiceClient()
      .from("talachero_profiles")
      .update({
        charges_enabled: charges,
        payouts_enabled: payouts,
      })
      .eq("id", profile.id);
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/stripe/webhook/route.ts "src/app/[locale]/dashboard/talachero/payment-actions.ts"
git commit -m "feat(onboarding): decouple Stripe onboarding from verification_status"
```

---

## Task 3: Talachero reader — `getMyOnboardingStatus()`

**Files:**
- Modify: `src/lib/data/talacheros.ts` (append near the other `getMy*` readers)

- [ ] **Step 1: Add the type + reader**

Append to `src/lib/data/talacheros.ts`:

```ts
import type { VerificationStatus } from "@/lib/supabase/types";

export interface OnboardingStatus {
  status: VerificationStatus;
  rejectionReason: string | null;
  profileComplete: boolean;
  hasAvailability: boolean;
  chargesEnabled: boolean;
}

/**
 * The signed-in talachero's onboarding state for the dashboard checklist:
 * verification status + whether each step is done. `profileComplete` = rate set
 * and >=1 service; `hasAvailability` = >=1 upcoming open slot. Returns null if
 * the caller has no profile.
 */
export async function getMyOnboardingStatus(): Promise<OnboardingStatus | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("talachero_profiles")
    .select("id, verification_status, rejection_reason, hourly_rate, charges_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) return null;

  const [{ count: serviceCount }, { count: slotCount }] = await Promise.all([
    supabase
      .from("talachero_services")
      .select("talachero_id", { count: "exact", head: true })
      .eq("talachero_id", profile.id),
    supabase
      .from("availability_slots")
      .select("id", { count: "exact", head: true })
      .eq("talachero_id", profile.id)
      .eq("status", "open")
      .gte("start_time", new Date().toISOString()),
  ]);

  return {
    status: profile.verification_status,
    rejectionReason: profile.rejection_reason,
    profileComplete: profile.hourly_rate !== null && (serviceCount ?? 0) > 0,
    hasAvailability: (slotCount ?? 0) > 0,
    chargesEnabled: profile.charges_enabled,
  };
}
```

Note: if `talacheros.ts` already imports from `@/lib/supabase/types`, merge the `VerificationStatus` name into the existing import instead of adding a duplicate import line.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/talacheros.ts
git commit -m "feat(onboarding): getMyOnboardingStatus reader"
```

---

## Task 4: Admin reader — `getVerificationQueue()`

**Files:**
- Modify: `src/lib/data/admin.ts` (add interface near the other `Admin*` interfaces + function near the other `list*`)

- [ ] **Step 1: Add the interface + reader**

Add the interface alongside the other `Admin*` interfaces in `src/lib/data/admin.ts`:

```ts
export interface AdminVerification {
  talacheroId: string;
  fullName: string;
  bio: string | null;
  hourlyRate: number;
  currency: string;
  serviceSlugs: string[];
  slotCount: number;
  chargesEnabled: boolean;
  submittedAt: string | null;
}
```

Add the reader alongside the other `list*` functions:

```ts
export async function getVerificationQueue(): Promise<AdminVerification[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_list_verifications");
  return (data ?? []).map((r) => ({
    talacheroId: r.talachero_id,
    fullName: r.full_name ?? "",
    bio: r.bio,
    hourlyRate: Number(r.hourly_rate ?? 0),
    currency: r.currency,
    serviceSlugs: r.service_slugs ?? [],
    slotCount: Number(r.slot_count ?? 0),
    chargesEnabled: r.charges_enabled,
    submittedAt: r.submitted_at,
  }));
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/admin.ts
git commit -m "feat(onboarding): admin getVerificationQueue reader"
```

---

## Task 5: Talachero submit action

**Files:**
- Create: `src/app/[locale]/dashboard/talachero/onboarding-actions.ts`

- [ ] **Step 1: Write the action**

Create the file:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

export type SubmitState = {
  status: "idle" | "success" | "error";
  error?: string;
};

/** Map submit_talachero_for_review's raised codes to a translatable set;
 * anything unexpected collapses to "generic". Mirrors mapProfileError(). */
function mapSubmitError(message: string): string {
  const known = [
    "profile_incomplete",
    "no_availability",
    "already_submitted",
    "already_verified",
  ];
  const m = message.toLowerCase();
  return known.find((code) => m.includes(code)) ?? "generic";
}

export async function submitForReview(
  _prev: SubmitState,
  _formData: FormData
): Promise<SubmitState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_talachero_for_review");
  if (error) {
    return { status: "error", error: mapSubmitError(error.message) };
  }
  revalidatePath(`/${await getLocale()}/dashboard/talachero`);
  return { status: "success" };
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/dashboard/talachero/onboarding-actions.ts"
git commit -m "feat(onboarding): submitForReview server action"
```

---

## Task 6: Admin approve / reject actions

**Files:**
- Modify: `src/app/[locale]/dashboard/admin/actions.ts` (append two actions)

- [ ] **Step 1: Append the actions**

Append to `src/app/[locale]/dashboard/admin/actions.ts` (the `createClient`, `revalidatePath`, `getLocale` imports already exist at the top of the file):

```ts
/** Approve a talachero's submission. admin_review_talachero self-gates on
 * is_admin(); the RLS client is fine (mirrors setBan/deleteReview). p_reason has
 * a SQL default (null), so the generator marks it optional and we omit it — same
 * as resolveDispute omitting p_note. */
export async function approveTalachero(formData: FormData) {
  const talacheroId = String(formData.get("talacheroId") ?? "");
  const supabase = await createClient();
  await supabase.rpc("admin_review_talachero", {
    p_talachero_id: talacheroId,
    p_approve: true,
  });
  revalidatePath(`/${await getLocale()}/dashboard/admin/verifications`);
}

/** Reject a talachero's submission with a reason. Empty reason is rejected by
 * the RPC (empty_reason); the UI requires the field, so this is defensive. */
export async function rejectTalachero(formData: FormData) {
  const talacheroId = String(formData.get("talacheroId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const supabase = await createClient();
  await supabase.rpc("admin_review_talachero", {
    p_talachero_id: talacheroId,
    p_approve: false,
    p_reason: reason,
  });
  revalidatePath(`/${await getLocale()}/dashboard/admin/verifications`);
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean. (`p_reason` is optional in the generated type because it has a SQL default, so `approveTalachero` omits it and `rejectTalachero` passes the string — no cast needed. If typecheck unexpectedly requires it on approve, pass `p_reason: null as unknown as string`.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/dashboard/admin/actions.ts"
git commit -m "feat(onboarding): admin approve/reject talachero actions"
```

---

## Task 7: i18n — `onboarding` + admin verification keys

**Files:**
- Modify: `messages/es.json`
- Modify: `messages/en.json`

- [ ] **Step 1: Add to `messages/es.json`**

Add a top-level `"onboarding"` object:

```json
"onboarding": {
  "title": "Configura tu cuenta",
  "subtitle": "Completa estos pasos para que los clientes puedan encontrarte y reservar.",
  "step_profile": "Completa tu perfil",
  "step_profile_desc": "Bio, servicios y tarifa por hora.",
  "step_availability": "Define tu disponibilidad",
  "step_availability_desc": "Abre al menos un horario para recibir reservas.",
  "step_payments": "Conecta tus pagos",
  "step_payments_desc": "Opcional para aparecer; requerido para cobrar. Configúralo en el panel de pagos.",
  "edit": "Editar",
  "submit": "Enviar a revisión",
  "resubmit": "Reenviar a revisión",
  "in_review_title": "En revisión",
  "in_review_body": "Estamos revisando tu perfil. Te avisaremos cuando esté aprobado.",
  "rejected_title": "Necesita cambios",
  "rejected_body": "Corrige lo indicado y vuelve a enviar tu perfil a revisión.",
  "live_title": "¡Estás en vivo!",
  "live_body": "Tu perfil ya aparece en el directorio y puedes recibir reservas.",
  "error_profile_incomplete": "Completa tu perfil (tarifa y al menos un servicio) antes de enviar.",
  "error_no_availability": "Abre al menos un horario disponible antes de enviar.",
  "error_already_submitted": "Tu perfil ya está en revisión.",
  "error_already_verified": "Tu perfil ya está aprobado.",
  "error_generic": "No pudimos enviar tu perfil. Inténtalo de nuevo."
}
```

Then add these keys inside the EXISTING `"admin"` object (next to the `nav_disputes` / `disputes_*` keys):

```json
"nav_verifications": "Verificaciones",
"nav_verifications_desc": "Aprueba o rechaza prestadores nuevos.",
"verifications_title": "Verificaciones de prestadores",
"col_services": "Servicios",
"col_rate": "Tarifa",
"col_slots": "Horarios",
"col_payments": "Pagos",
"col_submitted": "Enviado",
"payments_ready": "Listo",
"payments_pending": "Pendiente",
"action_approve": "Aprobar",
"action_reject": "Rechazar",
"reject_reason_label": "Motivo del rechazo",
"reject_reason_placeholder": "Explica qué debe corregir el prestador…"
```

- [ ] **Step 2: Add the mirror to `messages/en.json`**

Add the `"onboarding"` object:

```json
"onboarding": {
  "title": "Set up your account",
  "subtitle": "Complete these steps so clients can find and book you.",
  "step_profile": "Complete your profile",
  "step_profile_desc": "Bio, services, and hourly rate.",
  "step_availability": "Set your availability",
  "step_availability_desc": "Open at least one time slot to take bookings.",
  "step_payments": "Connect payments",
  "step_payments_desc": "Optional to get listed; required to get paid. Set it up in the payments panel.",
  "edit": "Edit",
  "submit": "Submit for review",
  "resubmit": "Resubmit for review",
  "in_review_title": "In review",
  "in_review_body": "We're reviewing your profile. We'll let you know once it's approved.",
  "rejected_title": "Needs changes",
  "rejected_body": "Fix the note below and resubmit your profile for review.",
  "live_title": "You're live!",
  "live_body": "Your profile is in the directory and you can take bookings.",
  "error_profile_incomplete": "Complete your profile (rate and at least one service) before submitting.",
  "error_no_availability": "Open at least one available time slot before submitting.",
  "error_already_submitted": "Your profile is already in review.",
  "error_already_verified": "Your profile is already approved.",
  "error_generic": "We couldn't submit your profile. Please try again."
}
```

And inside the EXISTING `"admin"` object:

```json
"nav_verifications": "Verifications",
"nav_verifications_desc": "Approve or reject new providers.",
"verifications_title": "Provider verifications",
"col_services": "Services",
"col_rate": "Rate",
"col_slots": "Slots",
"col_payments": "Payments",
"col_submitted": "Submitted",
"payments_ready": "Ready",
"payments_pending": "Pending",
"action_approve": "Approve",
"action_reject": "Reject",
"reject_reason_label": "Rejection reason",
"reject_reason_placeholder": "Explain what the provider should fix…"
```

- [ ] **Step 3: Verify parity**

Run:
```bash
node -e "const es=require('./messages/es.json'),en=require('./messages/en.json');const ks=o=>Object.keys(o).sort().join(',');console.log('onboarding parity:', ks(es.onboarding)===ks(en.onboarding));console.log('admin parity:', ks(es.admin)===ks(en.admin));"
```
Expected: both `true`. Fix JSON (commas) until it passes.

- [ ] **Step 4: Commit**

```bash
git add messages/es.json messages/en.json
git commit -m "i18n(onboarding): onboarding + admin verification namespaces (es/en)"
```

---

## Task 8: Talachero onboarding checklist + dashboard wiring

**Files:**
- Create: `src/app/[locale]/dashboard/talachero/onboarding-checklist.tsx`
- Modify: `src/app/[locale]/dashboard/talachero/page.tsx`

- [ ] **Step 1: Create the checklist client component**

Create `src/app/[locale]/dashboard/talachero/onboarding-checklist.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Circle, AlertCircle, Clock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import type { OnboardingStatus } from "@/lib/data/talacheros";
import { submitForReview, type SubmitState } from "./onboarding-actions";

function Step({
  done,
  title,
  desc,
  href,
  editLabel,
}: {
  done: boolean;
  title: string;
  desc: string;
  href?: string;
  editLabel: string;
}) {
  return (
    <li className="flex items-start gap-3">
      {done ? (
        <CheckCircle2 className="text-text-primary mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      ) : (
        <Circle className="text-text-muted mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      )}
      <div className="flex-1">
        <p className="text-text-primary text-sm font-medium">{title}</p>
        <p className="text-text-secondary text-xs">{desc}</p>
      </div>
      {href && (
        <Link href={href} className={buttonVariants({ size: "xs", variant: "outline" })}>
          {editLabel}
        </Link>
      )}
    </li>
  );
}

export function OnboardingChecklist({ initial }: { initial: OnboardingStatus }) {
  const t = useTranslations("onboarding");
  const [state, formAction, pending] = useActionState<SubmitState, FormData>(
    submitForReview,
    { status: "idle" }
  );

  const banner =
    "flex items-start gap-3 rounded-md border border-border-strong bg-surface-muted px-4 py-3 text-sm text-text-primary";

  if (initial.status === "verified") {
    return (
      <div role="status" className={banner}>
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div>
          <p className="font-medium">{t("live_title")}</p>
          <p className="text-text-secondary text-xs">{t("live_body")}</p>
        </div>
      </div>
    );
  }

  const canSubmit =
    initial.profileComplete &&
    initial.hasAvailability &&
    (initial.status === "pending" || initial.status === "rejected");
  const errorMsg =
    state.status === "error" ? t(`error_${state.error ?? "generic"}`) : null;

  return (
    <section className="border-border flex flex-col gap-4 rounded-lg border p-5">
      <div>
        <h2 className="text-text-primary text-lg font-semibold">{t("title")}</h2>
        <p className="text-text-secondary mt-1 text-sm">{t("subtitle")}</p>
      </div>

      {initial.status === "in_review" && (
        <div role="status" className={banner}>
          <Clock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">{t("in_review_title")}</p>
            <p className="text-text-secondary text-xs">{t("in_review_body")}</p>
          </div>
        </div>
      )}

      {initial.status === "rejected" && (
        <div role="alert" className={banner}>
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">{t("rejected_title")}</p>
            {initial.rejectionReason && (
              <p className="text-text-primary mt-1 text-sm">
                &ldquo;{initial.rejectionReason}&rdquo;
              </p>
            )}
            <p className="text-text-secondary mt-1 text-xs">{t("rejected_body")}</p>
          </div>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        <Step
          done={initial.profileComplete}
          title={t("step_profile")}
          desc={t("step_profile_desc")}
          href="/dashboard/talachero/profile"
          editLabel={t("edit")}
        />
        <Step
          done={initial.hasAvailability}
          title={t("step_availability")}
          desc={t("step_availability_desc")}
          href="/dashboard/talachero/availability"
          editLabel={t("edit")}
        />
        <Step
          done={initial.chargesEnabled}
          title={t("step_payments")}
          desc={t("step_payments_desc")}
          editLabel={t("edit")}
        />
      </ul>

      {errorMsg && (
        <div role="alert" className={banner}>
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{errorMsg}</span>
        </div>
      )}

      {initial.status !== "in_review" && (
        <form action={formAction} className="w-fit">
          <Button type="submit" size="sm" loading={pending} disabled={!canSubmit}>
            {initial.status === "rejected" ? t("resubmit") : t("submit")}
          </Button>
        </form>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Render it at the top of the talachero dashboard**

In `src/app/[locale]/dashboard/talachero/page.tsx`:

Add imports near the other imports:

```tsx
import { getMyOnboardingStatus } from "@/lib/data/talacheros";
import { OnboardingChecklist } from "./onboarding-checklist";
```

After the existing `const bookings = await getTalacheroBookings();` line, add:

```tsx
  const onboarding = await getMyOnboardingStatus();
```

Then render the checklist as the first child inside the top-level `<div className="flex flex-col gap-8">`, immediately after the heading block (the `<div>` containing `talachero_title`), before `<PaymentsPanel />`:

```tsx
      {onboarding && <OnboardingChecklist initial={onboarding} />}
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean. (If lint flags formatting on the new component, run `pnpm exec prettier --write` on that file only.)

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/dashboard/talachero/onboarding-checklist.tsx" "src/app/[locale]/dashboard/talachero/page.tsx"
git commit -m "feat(onboarding): talachero dashboard checklist + submit"
```

---

## Task 9: Admin verifications queue

**Files:**
- Create: `src/app/[locale]/dashboard/admin/verifications/page.tsx`
- Create: `src/app/[locale]/dashboard/admin/verifications/verifications-table.tsx`
- Create: `src/app/[locale]/dashboard/admin/verifications/reject-form.tsx`
- Modify: `src/app/[locale]/dashboard/admin/page.tsx` (add 5th card)

- [ ] **Step 1: Reject-with-reason client control**

Create `src/app/[locale]/dashboard/admin/verifications/reject-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { rejectTalachero } from "../actions";

function RejectSubmit() {
  const t = useTranslations("admin");
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" loading={pending}>
      {t("action_reject")}
    </Button>
  );
}

/** Reveals a required reason textarea, then submits rejectTalachero. Kept
 * separate from ConfirmButton because rejection needs a reason input. */
export function RejectForm({ talacheroId }: { talacheroId: string }) {
  const t = useTranslations("admin");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        {t("action_reject")}
      </Button>
    );
  }

  return (
    <form action={rejectTalachero} className="flex flex-col gap-2">
      <input type="hidden" name="talacheroId" value={talacheroId} />
      <label className="flex flex-col gap-1">
        <span className="text-text-secondary text-xs font-medium">
          {t("reject_reason_label")}
        </span>
        <textarea
          name="reason"
          required
          rows={2}
          placeholder={t("reject_reason_placeholder")}
          className="border-border bg-surface text-text-primary min-w-[220px] rounded-md border px-2 py-1 text-sm"
        />
      </label>
      <div className="flex items-center gap-2">
        <RejectSubmit />
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Verifications table**

Create `src/app/[locale]/dashboard/admin/verifications/verifications-table.tsx`:

```tsx
import { getTranslations, getLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import type { AdminVerification } from "@/lib/data/admin";
import { approveTalachero } from "../actions";
import { ConfirmButton } from "../confirm-button";
import { RejectForm } from "./reject-form";

export async function VerificationsTable({
  verifications,
}: {
  verifications: AdminVerification[];
}) {
  const t = await getTranslations("admin");
  if (verifications.length === 0) {
    return <p className="text-text-secondary text-sm">{t("empty")}</p>;
  }
  const locale = await getLocale();
  const ts = await getTranslations("services");
  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="text-text-secondary border-border border-b">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">{t("col_talachero")}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t("col_services")}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t("col_rate")}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t("col_slots")}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t("col_payments")}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t("col_actions")}</th>
          </tr>
        </thead>
        <tbody>
          {verifications.map((v) => (
            <tr
              key={v.talacheroId}
              className="border-border border-b align-top last:border-0"
            >
              <td className="text-text-primary px-4 py-3">
                <div className="font-medium">{v.fullName}</div>
                {v.bio && (
                  <div className="text-text-secondary max-w-xs break-words text-xs">
                    {v.bio}
                  </div>
                )}
              </td>
              <td className="text-text-secondary px-4 py-3">
                {v.serviceSlugs.map((s) => ts(`${s}.short`)).join(", ")}
              </td>
              <td className="text-text-primary px-4 py-3">
                {formatMoney(v.hourlyRate, locale, v.currency)}
              </td>
              <td className="text-text-primary px-4 py-3">{v.slotCount}</td>
              <td className="px-4 py-3">
                <Badge variant="muted">
                  {v.chargesEnabled ? t("payments_ready") : t("payments_pending")}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-start gap-2">
                  <form action={approveTalachero}>
                    <input type="hidden" name="talacheroId" value={v.talacheroId} />
                    <ConfirmButton label={t("action_approve")} tone="danger" />
                  </form>
                  <RejectForm talacheroId={v.talacheroId} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Route page**

Create `src/app/[locale]/dashboard/admin/verifications/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import type { Route } from "next";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getAppUser, dashboardPathForRole } from "@/lib/auth";
import { getVerificationQueue } from "@/lib/data/admin";
import { VerificationsTable } from "./verifications-table";

export default async function AdminVerificationsPage({
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
  const verifications = await getVerificationQueue();

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
        <h1 className="text-text-primary text-2xl font-semibold">
          {t("verifications_title")}
        </h1>
      </div>
      <VerificationsTable verifications={verifications} />
    </div>
  );
}
```

- [ ] **Step 4: Add the 5th overview card**

In `src/app/[locale]/dashboard/admin/page.tsx`, add to the `cards` array (after the `disputes` entry):

```tsx
    {
      href: "/dashboard/admin/verifications" as Route,
      title: t("nav_verifications"),
      desc: t("nav_verifications_desc"),
    },
```

- [ ] **Step 5: Typecheck + lint + build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: clean; `/[locale]/dashboard/admin/verifications` appears in the build route list.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/dashboard/admin/verifications" "src/app/[locale]/dashboard/admin/page.tsx"
git commit -m "feat(onboarding): admin verifications queue + overview card"
```

---

## Task 10: Final verification + PR

**Files:** none (verification only)

- [ ] **Step 1: Full static verification**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: all clean; both new routes/behaviors present.

- [ ] **Step 2: Browser pass (dev server + seed accounts)**

Start `pnpm dev`. As a talachero whose profile you can control (e.g. sign in as a seed talachero, or use SQL to set one to `verification_status='pending'` first so the checklist shows):
1. Talachero dashboard shows the **"Configura tu cuenta"** checklist. With profile + availability complete, **"Enviar a revisión"** enables → submit → the card flips to **"En revisión"**.
2. As `admin@talachas.mx` / `password123` → `/dashboard/admin` shows the **Verificaciones** card → open it → the submitted talachero is listed with services/rate/slots/payments.
3. **Reject** with a reason → back on the talachero dashboard, the **"Necesita cambios"** banner shows the reason; **"Reenviar a revisión"** works.
4. **Approve** → talachero dashboard shows **"¡Estás en vivo!"**; the talachero now appears in `/es/talacheros`.
5. Zero console errors.

- [ ] **Step 3: Update HANDOFF + Notion**

Add an onboarding section to `HANDOFF.md` (what shipped, the Stripe-decouple behavioral change, migrations `20260722130001`/`20260722130002`, cloud-push reminder). Commit `docs: HANDOFF — talachero onboarding`. Move the Notion "Registro y onboarding de prestadores" + "Diseñar flujo de onboarding" tasks to En revisión/Hecho as agreed.

- [ ] **Step 4: Open the PR**

```bash
git push -u origin feat/talachero-onboarding
gh pr create --base main --title "Self-service talachero onboarding (Sprint 2)" \
  --body "Admin-reviewed onboarding: dashboard checklist + submit-for-review, admin approval queue. Adds in_review state + rejection_reason/submitted_at; three SECURITY DEFINER RPCs; Stripe no longer auto-verifies (admin approval is the sole path to verified). Spec + plan in docs/superpowers/. Verified: typecheck/lint/build + DB-level RPC checks + browser pass.

Note: both migrations (20260722130001 enum, 20260722130002) must be pushed to the cloud via 'supabase db push' before this works in production.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Self-review notes (author)

- **Spec coverage:** state model + columns (Task 1) ✓ · three RPCs (Task 1) ✓ · Stripe decouple (Task 2) ✓ · talachero reader (Task 3) ✓ · admin reader (Task 4) ✓ · submit action (Task 5) ✓ · admin actions (Task 6) ✓ · i18n (Task 7) ✓ · checklist + dashboard (Task 8) ✓ · admin queue + 5th card (Task 9) ✓ · verification incl. DB + browser + directory-inclusion check (Tasks 1, 10) ✓. Directory gate unchanged (relies on existing `= 'verified'`). Non-goals (coverage-zone, ID upload, QA suite) excluded.
- **Type consistency:** `OnboardingStatus { status, rejectionReason, profileComplete, hasAvailability, chargesEnabled }` (Task 3) consumed unchanged in Tasks 5/8. `AdminVerification { talacheroId, fullName, bio, hourlyRate, currency, serviceSlugs, slotCount, chargesEnabled, submittedAt }` (Task 4) consumed in Task 9. `SubmitState` (Task 5) consumed in Task 8. RPC names/params consistent across Tasks 1/5/6. `admin_review_talachero(p_talachero_id, p_approve, p_reason)` matches the migration signature.
- **No placeholders:** every code step shows complete code; every run step shows the command + expected result.
- **Enum gotcha:** migrations are two files (Task 1) so the new value is committed before use; `admin_review_talachero`/`submit` reference `'in_review'` only inside plpgsql bodies (parsed lazily), so even a combined transaction would be safe — two files is belt-and-suspenders.
