# Phase 6 cycle 2 — Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin panel at `/dashboard/admin` with three moderation features — users list + ban/unban, bookings list + force-refund, reviews list + delete.

**Architecture:** Extend the app's dominant pattern — every admin mutation is a `SECURITY DEFINER` Postgres RPC that self-validates `is_admin()` — plus curated `SECURITY DEFINER` read RPCs (names live behind `users` RLS, so we return safe projections, same as `get_my_bookings`). Ban writes `auth.users.banned_until` (GoTrue rejects sign-in + refresh). Force-refund is the one exception: it is a Stripe API call (not a DB write), so it stays a server action reusing the ready reverse-transfer reference impl; the `charge.refunded` webhook reconciles state. UI is route-per-view server components with a small shared client confirm-button.

**Tech Stack:** Next.js 16 App Router (server components + server actions), Supabase Postgres (SECURITY DEFINER RPCs, RLS), Stripe Connect (refunds), next-intl, Tailwind v4, TypeScript strict.

**Plan note (refinement of the spec):** The design said only `admin_list_users` needs an RPC (bookings/reviews reads "via the RLS client"). During planning we chose curated read RPCs for **all three** lists instead — booking/review party names sit behind `users` own-row RLS, and PostgREST embedding across `bookings → talachero_profiles → users` is clunky; curated RPCs match the codebase's established read pattern (`list_talacheros`, `get_my_bookings`) and keep the UI trivial. Functional scope is unchanged.

**Verification model:** No test runner in this repo. "Tests" = (a) DB-level assertions via `psql` using the cycle-1 auth-simulation recipe, and (b) `pnpm typecheck && pnpm lint` (and `pnpm build` at the end) for app code. The live force-refund charge→refund is an owner runbook (needs Stripe test keys), like Phase 4B.

**Local prereqs (already true this session):** Docker up; `pnpm exec supabase start` running on `:55321`; dev server on `:3000`. `psql` is not on PATH — run SQL via `docker exec supabase_db_talachas-mvp psql -U postgres -d postgres`. **Do NOT `db reset`** (it re-wipes Carlos's Stripe onboarding); apply migrations with `supabase migration up --local`.

Auth-simulation recipe (to call a `SECURITY DEFINER` RPC as a given user in psql):
```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<USER_UUID>","role":"authenticated"}', true);
select <rpc_call>;
rollback;   -- or commit to persist
```

---

## File Structure

**Create:**
- `supabase/migrations/20260707130001_admin_panel.sql` — 5 admin RPCs (2 write, 3 read).
- `supabase/migrations/20260707130002_ban_aware_directory.sql` — ban-exclude `list_talacheros` + ban-reject `create_booking`.
- `src/lib/stripe/refunds.ts` — shared `refundCapturedBooking()` helper.
- `src/lib/data/admin.ts` — typed read helpers (`listUsers`, `listRefundableBookings`, `listReviews`).
- `src/app/[locale]/dashboard/admin/actions.ts` — `setBan`, `deleteReview`, `forceRefund` server actions.
- `src/app/[locale]/dashboard/admin/confirm-button.tsx` — shared two-click confirm client component.
- `src/app/[locale]/dashboard/admin/users/page.tsx`, `users/users-table.tsx`
- `src/app/[locale]/dashboard/admin/bookings/page.tsx`, `bookings/bookings-table.tsx`
- `src/app/[locale]/dashboard/admin/reviews/page.tsx`, `reviews/reviews-table.tsx`

**Modify:**
- `src/app/[locale]/dashboard/admin/page.tsx` — replace placeholder grid with an overview linking the three sections.
- `src/app/[locale]/dashboard/actions.ts` — use the shared refund helper in `cancelBooking`'s `captured` branch; drop the "reference only, do not delete" caveat.
- `src/lib/supabase/database.types.ts` — regenerate.
- `supabase/seed.sql` — add the seed admin user.
- `messages/es.json` + `messages/en.json` — `admin` namespace additions (kept in sync).

---

## Task 1: Admin RPCs migration (mutations + curated reads)

**Files:**
- Create: `supabase/migrations/20260707130001_admin_panel.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260707130001_admin_panel.sql`:

```sql
-- Phase 6 cycle 2 · Admin panel RPCs.
-- Every admin mutation is a SECURITY DEFINER function that self-validates
-- is_admin() (mirrors create_booking / create_review). Reads are curated
-- projections because party names sit behind users own-row RLS.

-- ---- Ban / unban -----------------------------------------------------------
-- Writes auth.users.banned_until; GoTrue rejects sign-in + token refresh while
-- banned_until > now(). Runs as owner (postgres), which may write auth.users.
create or replace function public.admin_set_ban(p_user_id uuid, p_banned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  select role into v_role from public.users where id = p_user_id;
  if not found then
    raise exception 'user_not_found';
  end if;
  -- Never ban an admin (covers self-ban).
  if p_banned and v_role = 'admin' then
    raise exception 'cannot_ban_admin';
  end if;
  update auth.users
     set banned_until = case when p_banned then 'infinity'::timestamptz else null end
   where id = p_user_id;
end;
$$;
grant execute on function public.admin_set_ban(uuid, boolean) to authenticated;

-- ---- Delete review ---------------------------------------------------------
-- reviews DELETE is not granted to authenticated and has no policy; this RPC is
-- the only path. The reviews_rating_rollup AFTER DELETE trigger recomputes the
-- talachero's rating_avg / rating_count.
create or replace function public.admin_delete_review(p_review_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  if not exists (select 1 from reviews where id = p_review_id) then
    raise exception 'review_not_found';
  end if;
  delete from reviews where id = p_review_id;
end;
$$;
grant execute on function public.admin_delete_review(uuid) to authenticated;

-- ---- Reads (curated projections) -------------------------------------------
create or replace function public.admin_list_users()
returns table (id uuid, email text, full_name text, role public.user_role, banned boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  return query
    select u.id, u.email, u.full_name, u.role,
           (au.banned_until is not null and au.banned_until > now()) as banned
      from public.users u
      join auth.users au on au.id = u.id
     order by u.role, u.email;
end;
$$;
grant execute on function public.admin_list_users() to authenticated;

-- Refundable set = captured payments (capture happens at completion).
create or replace function public.admin_list_bookings()
returns table (
  id uuid, client_name text, talachero_name text,
  price numeric, currency text, payment_status text, created_at timestamptz
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
    select b.id, cu.full_name, tu.full_name,
           b.price, b.currency, b.payment_status, b.created_at
      from bookings b
      join users cu on cu.id = b.client_id
      join talachero_profiles tp on tp.id = b.talachero_id
      join users tu on tu.id = tp.user_id
     where b.payment_status = 'captured'
     order by b.created_at desc;
end;
$$;
grant execute on function public.admin_list_bookings() to authenticated;

create or replace function public.admin_list_reviews()
returns table (
  id uuid, author_name text, target_name text,
  rating integer, comment text, created_at timestamptz
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
    select r.id, au.full_name, tu.full_name, r.rating, r.comment, r.created_at
      from reviews r
      join users au on au.id = r.author_id
      join users tu on tu.id = r.target_id
     order by r.created_at desc;
end;
$$;
grant execute on function public.admin_list_reviews() to authenticated;
```

- [ ] **Step 2: Apply the migration**

Run: `pnpm exec supabase migration up --local`
Expected: applies `20260707130001_admin_panel.sql` with no error.

- [ ] **Step 3: Verify functions exist and are admin-guarded**

There is no seed admin yet (Task 3 creates one), so verify (a) the functions exist and (b) a **non-admin** caller is rejected. Pick a client id:

```bash
docker exec supabase_db_talachas-mvp psql -U postgres -d postgres -tAc "
select proname from pg_proc where proname like 'admin\_%' order by proname;
-- non-admin (Mariana) must be rejected:
select id from users where email='mariana.ruiz@demo.talachas.mx';"
```
Expected: lists `admin_delete_review, admin_list_bookings, admin_list_reviews, admin_list_users, admin_set_ban`, plus Mariana's uuid.

```bash
MARIANA=<uuid-from-above>
docker exec supabase_db_talachas-mvp psql -U postgres -d postgres -tAc "
begin; set local role authenticated;
select set_config('request.jwt.claims','{\"sub\":\"$MARIANA\",\"role\":\"authenticated\"}',true);
select admin_list_users();
rollback;" 2>&1 | grep -i error
```
Expected: `ERROR:  not_authorized`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260707130001_admin_panel.sql
git commit -m "feat(admin): admin panel RPCs — ban, delete-review, curated list reads"
```

---

## Task 2: Ban-aware directory + booking

**Files:**
- Create: `supabase/migrations/20260707130002_ban_aware_directory.sql`
- Modify (regen after): `src/lib/supabase/database.types.ts`

- [ ] **Step 1: Write the migration**

`CREATE OR REPLACE` both functions with a banned-user exclusion (OUT columns unchanged, so no DROP needed). Create `supabase/migrations/20260707130002_ban_aware_directory.sql`:

```sql
-- Phase 6 cycle 2 · Ban-aware directory + booking.
-- A banned talachero (auth.users.banned_until > now()) must not appear in the
-- directory nor be newly bookable — otherwise a client could pay for a slot the
-- banned talachero can never accept (they can't sign in). Mirrors the
-- verification_status gate already in list_talacheros.

create or replace function public.list_talacheros(p_id uuid default null)
returns table (
  id               uuid,
  full_name        text,
  neighborhood     text,
  hourly_rate      numeric,
  rating_avg       numeric,
  rating_count     integer,
  jobs_completed   integer,
  years_experience integer,
  bio              text,
  services         text[],
  primary_service  text,
  available_today  boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    tp.id,
    us.full_name,
    n.name,
    tp.hourly_rate,
    tp.rating_avg,
    tp.rating_count,
    tp.jobs_completed,
    tp.years_experience,
    tp.bio,
    coalesce(
      array_agg(sc.slug order by ts.is_primary desc, sc.slug)
        filter (where sc.slug is not null),
      '{}'
    ) as services,
    (array_agg(sc.slug order by ts.is_primary desc)
        filter (where ts.is_primary))[1] as primary_service,
    exists (
      select 1
      from availability_slots s
      where s.talachero_id = tp.id
        and s.status = 'open'
        and (s.start_time at time zone 'America/Mexico_City')::date
            = (now() at time zone 'America/Mexico_City')::date
    ) as available_today
  from talachero_profiles tp
  join users us on us.id = tp.user_id
  left join neighborhoods n on n.id = tp.neighborhood_id
  left join talachero_services ts on ts.talachero_id = tp.id
  left join service_categories sc on sc.id = ts.service_category_id
  where tp.verification_status = 'verified'
    and (p_id is null or tp.id = p_id)
    and not exists (
      select 1 from auth.users au
      where au.id = tp.user_id
        and au.banned_until is not null
        and au.banned_until > now()
    )
  group by tp.id, us.full_name, n.name;
$$;

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
    coalesce(v_currency, 'MXN'),
    p_address, p_notes
  )
  returning id into v_booking_id;

  update availability_slots set status = 'booked' where id = p_slot_id;

  return v_booking_id;
end;
$$;
```

- [ ] **Step 2: Apply the migration**

Run: `pnpm exec supabase migration up --local`
Expected: applies `20260707130002_ban_aware_directory.sql` with no error.

- [ ] **Step 3: Verify ban exclusion (temporarily ban a talachero, confirm it drops)**

```bash
# baseline count, then ban Carlos directly, re-check, then unban.
docker exec supabase_db_talachas-mvp psql -U postgres -d postgres -tAc "
select 'before', count(*) from list_talacheros();
update auth.users set banned_until='infinity'
  where id=(select user_id from talachero_profiles where id='1b243cd7-650d-4efe-8fbe-27d6ba2442d9');
select 'after_ban', count(*) from list_talacheros();
select 'carlos_visible', count(*) from list_talacheros('1b243cd7-650d-4efe-8fbe-27d6ba2442d9');
update auth.users set banned_until=null
  where id=(select user_id from talachero_profiles where id='1b243cd7-650d-4efe-8fbe-27d6ba2442d9');
select 'after_unban', count(*) from list_talacheros();"
```
Expected: `after_ban` = `before` − 1; `carlos_visible` = 0; `after_unban` = `before`.

- [ ] **Step 4: Regenerate DB types**

Run: `pnpm exec supabase gen types typescript --local > src/lib/supabase/database.types.ts`
Expected: file updates; `git diff --stat` shows the new admin RPCs in `database.types.ts`.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: clean (no errors).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260707130002_ban_aware_directory.sql src/lib/supabase/database.types.ts
git commit -m "feat(admin): exclude banned talacheros from directory + block new bookings"
```

---

## Task 3: Seed admin user

**Files:**
- Modify: `supabase/seed.sql`

`handle_new_user` forces any signup role to non-admin, so an admin must be inserted then promoted with a direct `update`. Add to `seed.sql` (for future resets) **and** create one now via a one-off SQL (this session — no reset).

- [ ] **Step 1: Add the admin block to `supabase/seed.sql`**

Append this inside the seed's single `DO $$ ... $$` block, after the demo users are created (use the existing `uid` local variable already declared in that block):

```sql
  -- Platform admin. Inserting fires handle_new_user() (which forces role to
  -- 'client' — admin is never self-assignable), so promote to admin after.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  )
  values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
    'authenticated', 'admin@talachas.mx',
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('role', 'admin', 'full_name', 'Plataforma Admin'),
    now(), now(), '', '', '', ''
  )
  returning id into uid;

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  )
  values (
    gen_random_uuid(), uid, uid::text,
    jsonb_build_object('sub', uid::text, 'email', 'admin@talachas.mx', 'email_verified', true),
    'email', now(), now(), now()
  );

  update public.users set role = 'admin' where id = uid;
```

> If the seed's `DO` block has an existing terminal statement (e.g. a `raise notice`), insert this block **before** it. Verify the block still ends with the original `$$;`.

- [ ] **Step 2: Create the admin now (this session, no reset)**

Run the same insert as a one-off so the panel is testable immediately:

```bash
docker exec supabase_db_talachas-mvp psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
do \$\$
declare uid uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
    'authenticated', 'admin@talachas.mx',
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{\"provider\":\"email\",\"providers\":[\"email\"]}'::jsonb,
    jsonb_build_object('role','admin','full_name','Plataforma Admin'),
    now(), now(), '', '', '', '')
  returning id into uid;
  insert into auth.identities (id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text,
    jsonb_build_object('sub', uid::text, 'email','admin@talachas.mx','email_verified',true),
    'email', now(), now(), now());
  update public.users set role='admin' where id=uid;
end \$\$;"
```
Expected: `DO` (no error).

- [ ] **Step 3: Verify the admin exists and RPCs now succeed for it**

```bash
docker exec supabase_db_talachas-mvp psql -U postgres -d postgres -tAc "
select id, role from users where email='admin@talachas.mx';"
```
Copy the uuid, then confirm an admin-guarded read works:
```bash
ADMIN=<uuid>
docker exec supabase_db_talachas-mvp psql -U postgres -d postgres -tAc "
begin; set local role authenticated;
select set_config('request.jwt.claims','{\"sub\":\"$ADMIN\",\"role\":\"authenticated\"}',true);
select count(*) from admin_list_users();
rollback;"
```
Expected: role `admin`; count = total user count (≥ 11), no error.

- [ ] **Step 4: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat(admin): seed platform admin user (admin@talachas.mx)"
```

---

## Task 4: Shared refund helper + admin data-access layer

**Files:**
- Create: `src/lib/stripe/refunds.ts`
- Modify: `src/app/[locale]/dashboard/actions.ts:82-101`
- Create: `src/lib/data/admin.ts`

- [ ] **Step 1: Create the shared refund helper**

Create `src/lib/stripe/refunds.ts`:

```ts
import "server-only";
import { getStripe } from "./server";

/** Full refund of a captured booking: claw back the talachero's payout
 * (reverse_transfer) and return the platform commission (refund_application_fee)
 * so no party retains funds. The charge.refunded webhook reconciles
 * payment_status + the ledger. Assumes a FULL refund (partial/tiered refunds
 * per cancellation policy are still TODO). */
export async function refundCapturedBooking(paymentIntentId: string) {
  await getStripe().refunds.create({
    payment_intent: paymentIntentId,
    reverse_transfer: true,
    refund_application_fee: true,
  });
}
```

- [ ] **Step 2: Use the helper in `cancelBooking` and drop the caveat**

In `src/app/[locale]/dashboard/actions.ts`, add the import near the other imports:

```ts
import { refundCapturedBooking } from "@/lib/stripe/refunds";
```

Replace the `captured` branch (currently lines ~82-101) with:

```ts
    } else if (pay.payment_status === "captured") {
      // Full refund of a completed booking (reverse payout + commission). Shared
      // with the admin force-refund action (dashboard/admin/actions.ts). This
      // branch is currently unreachable via cancelBooking itself (cancel_booking
      // rejects 'completed'); the admin panel is the real caller.
      await safe(() => refundCapturedBooking(pay.stripe_payment_intent_id!));
    }
```

- [ ] **Step 3: Create the admin data-access layer**

Create `src/lib/data/admin.ts`:

```ts
import { createClient } from "@/lib/supabase/server";

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  banned: boolean;
}
export interface AdminBooking {
  id: string;
  clientName: string;
  talacheroName: string;
  price: number;
  currency: string;
  paymentStatus: string;
  createdAt: string;
}
export interface AdminReview {
  id: string;
  authorName: string;
  targetName: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export async function listUsers(): Promise<AdminUser[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_list_users");
  return (data ?? []).map((r) => ({
    id: r.id,
    email: r.email ?? "",
    fullName: r.full_name ?? "",
    role: r.role,
    banned: r.banned,
  }));
}

export async function listRefundableBookings(): Promise<AdminBooking[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_list_bookings");
  return (data ?? []).map((r) => ({
    id: r.id,
    clientName: r.client_name ?? "",
    talacheroName: r.talachero_name ?? "",
    price: Number(r.price ?? 0),
    currency: r.currency,
    paymentStatus: r.payment_status,
    createdAt: r.created_at,
  }));
}

export async function listReviews(): Promise<AdminReview[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_list_reviews");
  return (data ?? []).map((r) => ({
    id: r.id,
    authorName: r.author_name ?? "",
    targetName: r.target_name ?? "",
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at,
  }));
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean. (Confirms the regenerated types expose `admin_list_*` and the helper compiles.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/stripe/refunds.ts src/lib/data/admin.ts "src/app/[locale]/dashboard/actions.ts"
git commit -m "feat(admin): shared refund helper + admin data-access layer"
```

---

## Task 5: Admin server actions

**Files:**
- Create: `src/app/[locale]/dashboard/admin/actions.ts`

Row actions are plain form actions (fire-and-revalidate). The server RPCs enforce authz; the UI hides invalid controls (no ban on admin rows). RPC calls are wrapped so a raised code never throws out of a form action.

- [ ] **Step 1: Create the actions file**

Create `src/app/[locale]/dashboard/admin/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppUser } from "@/lib/auth";
import { refundCapturedBooking } from "@/lib/stripe/refunds";

/** Ban or unban a user. `banned` arrives as the string "true"/"false" from the
 * hidden form field. Errors from admin_set_ban (e.g. cannot_ban_admin) are
 * swallowed — the UI never offers ban on an admin row, and the RPC is the
 * authoritative guard regardless. */
export async function setBan(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const banned = String(formData.get("banned") ?? "") === "true";
  const supabase = await createClient();
  await supabase.rpc("admin_set_ban", { p_user_id: userId, p_banned: banned });
  revalidatePath(`/${await getLocale()}/dashboard/admin/users`);
}

export async function deleteReview(formData: FormData) {
  const reviewId = String(formData.get("reviewId") ?? "");
  const supabase = await createClient();
  await supabase.rpc("admin_delete_review", { p_review_id: reviewId });
  revalidatePath(`/${await getLocale()}/dashboard/admin/reviews`);
}

/** Force-refund a captured booking. Re-checks admin (defense in depth beyond the
 * page guard), verifies the booking is captured, then makes a best-effort Stripe
 * refund; the charge.refunded webhook reconciles payment_status + ledger. */
export async function forceRefund(formData: FormData) {
  const bookingId = String(formData.get("bookingId") ?? "");
  const user = await getAppUser();
  if (user?.role !== "admin") return;

  const { data: booking } = await createServiceClient()
    .from("bookings")
    .select("stripe_payment_intent_id, payment_status")
    .eq("id", bookingId)
    .maybeSingle();

  if (booking?.payment_status === "captured" && booking.stripe_payment_intent_id) {
    try {
      await refundCapturedBooking(booking.stripe_payment_intent_id);
    } catch {
      // best-effort; webhook remains the source of truth
    }
  }
  revalidatePath(`/${await getLocale()}/dashboard/admin/bookings`);
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/dashboard/admin/actions.ts"
git commit -m "feat(admin): server actions — setBan, deleteReview, forceRefund"
```

---

## Task 6: Shared confirm-button + i18n keys

**Files:**
- Create: `src/app/[locale]/dashboard/admin/confirm-button.tsx`
- Modify: `messages/es.json`, `messages/en.json`

- [ ] **Step 1: Create the confirm-button client component**

Two-click confirm: first click arms, second click submits the enclosing form. `useFormStatus` reads the form's pending state (the component renders inside each row's `<form>`).

Create `src/app/[locale]/dashboard/admin/confirm-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";

/** Renders a labelled action button that requires a second click to submit the
 * enclosing form. `tone="danger"` styles destructive actions (ban, delete,
 * refund); `tone="neutral"` for reversible ones (unban). */
export function ConfirmButton({
  label,
  tone = "danger",
}: {
  label: string;
  tone?: "danger" | "neutral";
}) {
  const t = useTranslations("admin");
  const [armed, setArmed] = useState(false);
  const { pending } = useFormStatus();

  const base =
    "rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-60";
  const danger = "border-border-strong text-text-primary border hover:bg-surface-hover";
  const primary = "bg-action-primary text-text-inverse hover:bg-action-primary-hover";

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className={`${base} ${tone === "danger" ? danger : primary}`}
      >
        {label}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="submit" disabled={pending} className={`${base} ${primary}`}>
        {t("confirm")}
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className={`${base} ${danger}`}
      >
        {t("cancel")}
      </button>
    </span>
  );
}
```

> Confirm `bg-surface-hover` / `border-border-strong` / `bg-action-primary` token classes exist in the project (grep `src/app/globals.css` or an existing component). If a token name differs, use the project's equivalent — do not introduce raw hex.

- [ ] **Step 2: Add the `admin` message keys to `messages/es.json`**

Extend the existing `dashboard` namespace's admin keys and add a new top-level `admin` namespace. Add this `admin` block to `messages/es.json` (keep JSON valid — add a comma after the preceding top-level namespace):

```json
  "admin": {
    "overview_title": "Panel de administración",
    "overview_subtitle": "Moderación de usuarios, reservas y reseñas.",
    "nav_users": "Usuarios",
    "nav_users_desc": "Ver y bloquear cuentas.",
    "nav_bookings": "Reservas",
    "nav_bookings_desc": "Reembolsar reservas cobradas.",
    "nav_reviews": "Reseñas",
    "nav_reviews_desc": "Eliminar reseñas.",
    "back": "Volver al panel",
    "confirm": "Confirmar",
    "cancel": "Cancelar",
    "empty": "Sin resultados.",
    "col_name": "Nombre",
    "col_email": "Correo",
    "col_role": "Rol",
    "col_status": "Estado",
    "col_actions": "Acciones",
    "status_active": "Activo",
    "status_banned": "Bloqueado",
    "action_ban": "Bloquear",
    "action_unban": "Desbloquear",
    "users_title": "Usuarios",
    "bookings_title": "Reservas reembolsables",
    "col_client": "Cliente",
    "col_talachero": "Talachero",
    "col_amount": "Monto",
    "col_payment": "Pago",
    "action_refund": "Reembolsar",
    "reviews_title": "Reseñas",
    "col_author": "Autor",
    "col_target": "Talachero",
    "col_rating": "Calificación",
    "col_comment": "Comentario",
    "col_date": "Fecha",
    "action_delete": "Eliminar"
  }
```

- [ ] **Step 3: Add the same keys to `messages/en.json`**

```json
  "admin": {
    "overview_title": "Admin panel",
    "overview_subtitle": "Moderate users, bookings, and reviews.",
    "nav_users": "Users",
    "nav_users_desc": "View and ban accounts.",
    "nav_bookings": "Bookings",
    "nav_bookings_desc": "Refund captured bookings.",
    "nav_reviews": "Reviews",
    "nav_reviews_desc": "Delete reviews.",
    "back": "Back to dashboard",
    "confirm": "Confirm",
    "cancel": "Cancel",
    "empty": "No results.",
    "col_name": "Name",
    "col_email": "Email",
    "col_role": "Role",
    "col_status": "Status",
    "col_actions": "Actions",
    "status_active": "Active",
    "status_banned": "Banned",
    "action_ban": "Ban",
    "action_unban": "Unban",
    "users_title": "Users",
    "bookings_title": "Refundable bookings",
    "col_client": "Client",
    "col_talachero": "Talachero",
    "col_amount": "Amount",
    "col_payment": "Payment",
    "action_refund": "Refund",
    "reviews_title": "Reviews",
    "col_author": "Author",
    "col_target": "Talachero",
    "col_rating": "Rating",
    "col_comment": "Comment",
    "col_date": "Date",
    "action_delete": "Delete"
  }
```

- [ ] **Step 4: Verify both locale files stay in sync + typecheck**

Run:
```bash
node -e "const a=Object.keys(require('./messages/es.json').admin).sort(),b=Object.keys(require('./messages/en.json').admin).sort();const d=a.filter(k=>!b.includes(k)).concat(b.filter(k=>!a.includes(k)));console.log(d.length?'DRIFT: '+d:'in sync')"
pnpm typecheck
```
Expected: `in sync`; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/dashboard/admin/confirm-button.tsx" messages/es.json messages/en.json
git commit -m "feat(admin): shared confirm-button + admin i18n keys"
```

---

## Task 7: Users page + table (ban / unban)

**Files:**
- Create: `src/app/[locale]/dashboard/admin/users/page.tsx`
- Create: `src/app/[locale]/dashboard/admin/users/users-table.tsx`

- [ ] **Step 1: Create the users table (server component)**

Each non-admin row wraps a `setBan` form; `banned` hidden field toggles direction. Admin rows show no control. Create `src/app/[locale]/dashboard/admin/users/users-table.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import type { AdminUser } from "@/lib/data/admin";
import { setBan } from "../actions";
import { ConfirmButton } from "../confirm-button";

export async function UsersTable({ users }: { users: AdminUser[] }) {
  const t = await getTranslations("admin");
  if (users.length === 0) {
    return <p className="text-text-secondary text-sm">{t("empty")}</p>;
  }
  return (
    <div className="border-border-subtle overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="text-text-secondary border-border-subtle border-b">
          <tr>
            <th className="px-4 py-3 font-medium">{t("col_name")}</th>
            <th className="px-4 py-3 font-medium">{t("col_email")}</th>
            <th className="px-4 py-3 font-medium">{t("col_role")}</th>
            <th className="px-4 py-3 font-medium">{t("col_status")}</th>
            <th className="px-4 py-3 font-medium">{t("col_actions")}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-border-subtle border-b last:border-0">
              <td className="text-text-primary px-4 py-3">{u.fullName}</td>
              <td className="text-text-secondary px-4 py-3">{u.email}</td>
              <td className="text-text-secondary px-4 py-3">{u.role}</td>
              <td className="text-text-primary px-4 py-3">
                {u.banned ? t("status_banned") : t("status_active")}
              </td>
              <td className="px-4 py-3">
                {u.role !== "admin" && (
                  <form action={setBan}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="banned" value={u.banned ? "false" : "true"} />
                    <ConfirmButton
                      label={u.banned ? t("action_unban") : t("action_ban")}
                      tone={u.banned ? "neutral" : "danger"}
                    />
                  </form>
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

- [ ] **Step 2: Create the users page (admin-guarded)**

Create `src/app/[locale]/dashboard/admin/users/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import type { Route } from "next";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getAppUser, dashboardPathForRole } from "@/lib/auth";
import { listUsers } from "@/lib/data/admin";
import { UsersTable } from "./users-table";

export default async function AdminUsersPage({
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
  const users = await listUsers();

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
        <h1 className="text-text-primary text-2xl font-semibold">{t("users_title")}</h1>
      </div>
      <UsersTable users={users} />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/dashboard/admin/users"
git commit -m "feat(admin): users list with ban/unban"
```

---

## Task 8: Bookings page + table (force-refund)

**Files:**
- Create: `src/app/[locale]/dashboard/admin/bookings/page.tsx`
- Create: `src/app/[locale]/dashboard/admin/bookings/bookings-table.tsx`

- [ ] **Step 1: Create the bookings table (server component)**

Uses `formatMoney` for the amount (matches the app's currency formatter). Create `src/app/[locale]/dashboard/admin/bookings/bookings-table.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import type { AdminBooking } from "@/lib/data/admin";
import { formatMoney } from "@/lib/format";
import { forceRefund } from "../actions";
import { ConfirmButton } from "../confirm-button";

export async function BookingsTable({ bookings }: { bookings: AdminBooking[] }) {
  const t = await getTranslations("admin");
  if (bookings.length === 0) {
    return <p className="text-text-secondary text-sm">{t("empty")}</p>;
  }
  return (
    <div className="border-border-subtle overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="text-text-secondary border-border-subtle border-b">
          <tr>
            <th className="px-4 py-3 font-medium">{t("col_client")}</th>
            <th className="px-4 py-3 font-medium">{t("col_talachero")}</th>
            <th className="px-4 py-3 font-medium">{t("col_amount")}</th>
            <th className="px-4 py-3 font-medium">{t("col_payment")}</th>
            <th className="px-4 py-3 font-medium">{t("col_actions")}</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id} className="border-border-subtle border-b last:border-0">
              <td className="text-text-primary px-4 py-3">{b.clientName}</td>
              <td className="text-text-primary px-4 py-3">{b.talacheroName}</td>
              <td className="text-text-primary px-4 py-3">{formatMoney(b.price)}</td>
              <td className="text-text-secondary px-4 py-3">{b.paymentStatus}</td>
              <td className="px-4 py-3">
                <form action={forceRefund}>
                  <input type="hidden" name="bookingId" value={b.id} />
                  <ConfirmButton label={t("action_refund")} tone="danger" />
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

> Confirm `formatMoney`'s import name/signature in `src/lib/format.ts` (HANDOFF references `formatMoney`). If it takes a currency arg, pass `b.currency`; adjust the call to the real signature.

- [ ] **Step 2: Create the bookings page (admin-guarded)**

Create `src/app/[locale]/dashboard/admin/bookings/page.tsx` — identical guard/shell to the users page, swapping data + table:

```tsx
import { redirect } from "next/navigation";
import type { Route } from "next";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getAppUser, dashboardPathForRole } from "@/lib/auth";
import { listRefundableBookings } from "@/lib/data/admin";
import { BookingsTable } from "./bookings-table";

export default async function AdminBookingsPage({
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
  const bookings = await listRefundableBookings();

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
        <h1 className="text-text-primary text-2xl font-semibold">{t("bookings_title")}</h1>
      </div>
      <BookingsTable bookings={bookings} />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/dashboard/admin/bookings"
git commit -m "feat(admin): refundable bookings list with force-refund"
```

---

## Task 9: Reviews page + table (delete)

**Files:**
- Create: `src/app/[locale]/dashboard/admin/reviews/page.tsx`
- Create: `src/app/[locale]/dashboard/admin/reviews/reviews-table.tsx`

- [ ] **Step 1: Create the reviews table (server component)**

Create `src/app/[locale]/dashboard/admin/reviews/reviews-table.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import type { AdminReview } from "@/lib/data/admin";
import { deleteReview } from "../actions";
import { ConfirmButton } from "../confirm-button";

export async function ReviewsTable({ reviews }: { reviews: AdminReview[] }) {
  const t = await getTranslations("admin");
  if (reviews.length === 0) {
    return <p className="text-text-secondary text-sm">{t("empty")}</p>;
  }
  return (
    <div className="border-border-subtle overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="text-text-secondary border-border-subtle border-b">
          <tr>
            <th className="px-4 py-3 font-medium">{t("col_author")}</th>
            <th className="px-4 py-3 font-medium">{t("col_target")}</th>
            <th className="px-4 py-3 font-medium">{t("col_rating")}</th>
            <th className="px-4 py-3 font-medium">{t("col_comment")}</th>
            <th className="px-4 py-3 font-medium">{t("col_actions")}</th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((r) => (
            <tr key={r.id} className="border-border-subtle border-b last:border-0">
              <td className="text-text-primary px-4 py-3">{r.authorName}</td>
              <td className="text-text-primary px-4 py-3">{r.targetName}</td>
              <td className="text-text-primary px-4 py-3">{r.rating} / 5</td>
              <td className="text-text-secondary max-w-xs px-4 py-3">{r.comment ?? ""}</td>
              <td className="px-4 py-3">
                <form action={deleteReview}>
                  <input type="hidden" name="reviewId" value={r.id} />
                  <ConfirmButton label={t("action_delete")} tone="danger" />
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Create the reviews page (admin-guarded)**

Create `src/app/[locale]/dashboard/admin/reviews/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import type { Route } from "next";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getAppUser, dashboardPathForRole } from "@/lib/auth";
import { listReviews } from "@/lib/data/admin";
import { ReviewsTable } from "./reviews-table";

export default async function AdminReviewsPage({
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
  const reviews = await listReviews();

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
        <h1 className="text-text-primary text-2xl font-semibold">{t("reviews_title")}</h1>
      </div>
      <ReviewsTable reviews={reviews} />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/dashboard/admin/reviews"
git commit -m "feat(admin): reviews list with delete"
```

---

## Task 10: Admin overview page (replace placeholder grid)

**Files:**
- Modify: `src/app/[locale]/dashboard/admin/page.tsx`

- [ ] **Step 1: Rewrite the overview to link the three sections**

Replace the entire contents of `src/app/[locale]/dashboard/admin/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import type { Route } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getAppUser, dashboardPathForRole } from "@/lib/auth";

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await getAppUser();
  if (!user) redirect(`/${locale}/auth/sign-in` as Route);
  // Admin-only. Non-admins never see this exists — they bounce to their home.
  if (user.role !== "admin") {
    redirect(`/${locale}${dashboardPathForRole(user.role)}` as Route);
  }

  const t = await getTranslations("admin");
  const cards: { href: Route; title: string; desc: string }[] = [
    { href: "/dashboard/admin/users" as Route, title: t("nav_users"), desc: t("nav_users_desc") },
    { href: "/dashboard/admin/bookings" as Route, title: t("nav_bookings"), desc: t("nav_bookings_desc") },
    { href: "/dashboard/admin/reviews" as Route, title: t("nav_reviews"), desc: t("nav_reviews_desc") },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-text-primary text-2xl font-semibold">{t("overview_title")}</h1>
        <p className="text-text-secondary mt-1 text-sm">{t("overview_subtitle")}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="border-border-subtle hover:bg-surface-hover rounded-lg border p-5 transition-colors"
          >
            <h2 className="text-text-primary font-medium">{c.title}</h2>
            <p className="text-text-secondary mt-1 text-sm">{c.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

> If `PlaceholderPanel` is now unused anywhere, leave it — it may still back other placeholder shells (e.g. talachero panels). Do not remove it without grepping usages.

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/dashboard/admin/page.tsx"
git commit -m "feat(admin): overview linking users / bookings / reviews"
```

---

## Task 11: Full verification + HANDOFF update

**Files:**
- Modify: `HANDOFF.md`

- [ ] **Step 1: Build clean**

Run: `pnpm build`
Expected: succeeds; the four `/dashboard/admin*` routes appear in the route list, no type/lint errors.

- [ ] **Step 2: DB-level admin flow smoke test (as the seed admin)**

Get the admin uuid and a review id, then exercise every RPC end-to-end (commit the ban, verify, unban; delete a review created for this test so no seed data is lost):

```bash
ADMIN=$(docker exec supabase_db_talachas-mvp psql -U postgres -d postgres -tAc "select id from users where email='admin@talachas.mx';" | tr -d ' ')
CARLOS_USER=$(docker exec supabase_db_talachas-mvp psql -U postgres -d postgres -tAc "select user_id from talachero_profiles where id='1b243cd7-650d-4efe-8fbe-27d6ba2442d9';" | tr -d ' ')
claims() { echo "select set_config('request.jwt.claims','{\"sub\":\"$1\",\"role\":\"authenticated\"}',true);"; }

# ban Carlos as admin, verify banned_until set, then unban
docker exec supabase_db_talachas-mvp psql -U postgres -d postgres -tAc "
begin; set local role authenticated; $(claims $ADMIN)
select admin_set_ban('$CARLOS_USER'::uuid, true); commit;"
docker exec supabase_db_talachas-mvp psql -U postgres -d postgres -tAc "
select 'banned_until', banned_until from auth.users where id='$CARLOS_USER';"
docker exec supabase_db_talachas-mvp psql -U postgres -d postgres -tAc "
begin; set local role authenticated; $(claims $ADMIN)
select admin_set_ban('$CARLOS_USER'::uuid, false); commit;"

# cannot_ban_admin guard
docker exec supabase_db_talachas-mvp psql -U postgres -d postgres -tAc "
begin; set local role authenticated; $(claims $ADMIN)
select admin_set_ban('$ADMIN'::uuid, true); rollback;" 2>&1 | grep -i error
```
Expected: `banned_until` = `infinity` after ban, then cleared; the self-ban attempt → `ERROR: cannot_ban_admin`.

- [ ] **Step 3: Browser guard check (headless curl)**

With the dev server on `:3000`, confirm the admin routes redirect a signed-out request (307) rather than 500:
```bash
for p in /es/dashboard/admin /es/dashboard/admin/users /es/dashboard/admin/bookings /es/dashboard/admin/reviews; do
  echo "$(/usr/bin/curl -s -o /dev/null -w '%{http_code}' http://localhost:3000$p)  $p"
done
```
Expected: all `307` (auth redirect), none `500`.

- [ ] **Step 4: Update HANDOFF.md**

Add a "Phase 6 cycle 2 — what shipped (admin panel)" section: the 5 admin RPCs, ban-aware directory/booking, seed admin (`admin@talachas.mx` / `password123`), the three admin sub-routes + force-refund reusing the reverse-transfer helper. Record DB-level verification done; note the **live force-refund charge→refund is an owner runbook** (needs Stripe test keys + a re-onboarded talachero + a captured booking). Move cycle 2 to ✅ in the status table; set next work to **cycle 3 — disputes queue** (needs the deferred flag mechanism). Note the **owner browser walk-through** of the admin UI is still pending (same as cycle 1).

- [ ] **Step 5: Commit + open PR**

```bash
git add HANDOFF.md
git commit -m "docs: HANDOFF — Phase 6 cycle 2 admin panel"
git push -u origin feat/phase6-admin-panel
gh pr create --title "Phase 6 (cycle 2) — Admin panel" --body "Users/ban, bookings/force-refund, reviews/delete. DB-level verified; live refund is an owner runbook. Spec + plan in docs/superpowers/."
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- Users list + ban/unban → Tasks 1 (`admin_set_ban`), 2 (ban-aware directory/booking), 7 (UI). ✓
- Bookings list + force-refund → Tasks 1 (`admin_list_bookings`), 4 (shared helper), 5 (`forceRefund`), 8 (UI). ✓
- Reviews list + delete → Tasks 1 (`admin_delete_review`, `admin_list_reviews`), 5, 9 (UI). ✓
- Ban = block sign-in via `auth.users.banned_until` + directory drop → Tasks 1, 2. ✓
- SECURITY DEFINER + `is_admin()` pattern → all RPCs in Task 1. ✓
- Seed admin → Task 3. ✓
- Verification (DB-level + typecheck/lint/build; live refund = owner runbook) → Task 11. ✓
- Out of scope (disputes, partial refunds, audit log, pagination) → not built; disputes teed up in Task 11 HANDOFF note. ✓

**Refinement flagged:** curated read RPCs for all three lists (not just users) — noted at plan top.

**Placeholder scan:** none — all steps contain full code/commands. Two "confirm the token/signature exists" notes (Tasks 6, 8) are deliberate guards against project-specific naming, each with a concrete fallback instruction, not deferred work.

**Type consistency:** `AdminUser/AdminBooking/AdminReview` shapes in `src/lib/data/admin.ts` (Task 4) match the columns returned by `admin_list_users/bookings/reviews` (Task 1) and the props consumed by the tables (Tasks 7–9). `refundCapturedBooking` (Task 4) is the single name used by both `cancelBooking` and `forceRefund` (Tasks 4, 5). Action names `setBan`/`deleteReview`/`forceRefund` (Task 5) match the form imports (Tasks 7–9).
```
