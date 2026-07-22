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
