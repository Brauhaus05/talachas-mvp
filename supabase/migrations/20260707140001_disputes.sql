-- Phase 6 cycle 3 · Disputes queue.
-- A client flags a completed+captured booking; it lands in an admin queue; the
-- admin resolves it with a full refund or a dismissal. All writes go through
-- SECURITY DEFINER RPCs (mirrors create_review / the cycle-2 admin RPCs). The
-- refund itself is a Stripe call in the server action; the charge.refunded
-- webhook stays the source of truth for payment_status + the ledger.

create type public.dispute_status as enum ('open', 'refunded', 'dismissed');

create table public.disputes (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null unique references public.bookings(id) on delete cascade, -- one dispute per booking (dismissal is final; intentional, no re-raise)
  raised_by   uuid not null references public.users(id) on delete restrict,
  reason      text not null,
  status      public.dispute_status not null default 'open',
  admin_note  text,
  resolved_by uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index disputes_status_idx on public.disputes (status);
create index disputes_raised_by_idx on public.disputes (raised_by);

-- RLS: a client reads their own disputes (dashboard status); admin reads all
-- (mirrors the `or public.is_admin()` pattern used throughout rls_policies.sql).
-- All writes go through SECURITY DEFINER RPCs only, so INSERT/UPDATE/DELETE are
-- never granted to authenticated (mirrors bookings/reviews).
alter table public.disputes enable row level security;

create policy "clients read their own disputes"
  on public.disputes for select
  using (raised_by = auth.uid() or public.is_admin());

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
  select status into v_status from disputes where id = p_dispute_id for update;
  if not found then
    raise exception 'dispute_not_found';
  end if;
  if v_status <> 'open' then
    raise exception 'dispute_not_open';
  end if;
  update disputes
     set status      = case when p_refunded then 'refunded' else 'dismissed' end::public.dispute_status,
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
