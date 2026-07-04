-- Phase 4B · Migration 10 — expose payment_status on booking lists
-- Return-type changes require a drop first (CREATE OR REPLACE can't alter the
-- OUT columns of a set-returning function).

drop function if exists public.get_my_bookings();
drop function if exists public.get_talachero_bookings();

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
  slot_start     timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id, b.status, b.payment_status, b.price, b.currency, b.address,
    b.created_at, tp.id, tu.full_name, sc.slug, s.start_time
  from bookings b
  join talachero_profiles tp on tp.id = b.talachero_id
  join users tu on tu.id = tp.user_id
  join service_categories sc on sc.id = b.service_category_id
  left join availability_slots s on s.id = b.slot_id
  where b.client_id = auth.uid()
  order by b.created_at desc;
$$;

create function public.get_talachero_bookings()
returns table (
  id             uuid,
  status         public.booking_status,
  payment_status text,
  price          numeric,
  currency       text,
  address        text,
  created_at     timestamptz,
  client_name    text,
  service_slug   text,
  slot_start     timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id, b.status, b.payment_status, b.price, b.currency, b.address,
    b.created_at, cu.full_name, sc.slug, s.start_time
  from bookings b
  join talachero_profiles tp on tp.id = b.talachero_id
  join users cu on cu.id = b.client_id
  join service_categories sc on sc.id = b.service_category_id
  left join availability_slots s on s.id = b.slot_id
  where tp.user_id = auth.uid()
  order by b.created_at desc;
$$;

grant execute on function public.get_my_bookings() to authenticated;
grant execute on function public.get_talachero_bookings() to authenticated;
