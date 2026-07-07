-- Phase 6 · get_my_bookings gains has_review so the client dashboard can show a
-- "leave a review" prompt on completed bookings without a second query.
-- CREATE OR REPLACE can't alter OUT columns → DROP then CREATE.

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
  has_review     boolean
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
            where r.booking_id = b.id and r.author_id = auth.uid()) as has_review
  from bookings b
  join talachero_profiles tp on tp.id = b.talachero_id
  join users tu on tu.id = tp.user_id
  join service_categories sc on sc.id = b.service_category_id
  left join availability_slots s on s.id = b.slot_id
  where b.client_id = auth.uid()
  order by b.created_at desc;
$$;

grant execute on function public.get_my_bookings() to authenticated;
