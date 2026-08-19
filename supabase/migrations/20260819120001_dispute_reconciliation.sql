-- Sprint 3 · Disputes ↔ bookings reconciliation.
--
-- 1) get_my_bookings exposes dispute_status in place of has_dispute, so the
--    client dashboard can render a terminal state for a resolved report. Today
--    a dismissed dispute reads "Reporte en revisión" forever, and a refunded one
--    shows nothing at all (the card's payment_status='captured' gate stops
--    matching once the refund lands).
-- 2) One-time backfill closing disputes whose booking was already refunded
--    out-of-band (admin force-refund, or a refund issued from the Stripe
--    dashboard), which leaves them stuck 'open' with no correct resolution path.

-- ---- get_my_bookings: has_dispute → dispute_status --------------------------
-- CREATE OR REPLACE cannot alter a function's OUT columns → DROP then CREATE.
-- disputes.booking_id is UNIQUE, so the scalar subquery returns at most one row;
-- NULL means "no dispute", exactly the old has_dispute = false. The LIMIT 1 is
-- belt-and-braces: it costs nothing and keeps a duplicate dispute row (if that
-- UNIQUE constraint were ever dropped) from raising "more than one row returned
-- by a subquery" and failing get_my_bookings for ALL of a client's bookings —
-- a far bigger blast radius than the exists() this replaced, which was
-- insensitive to cardinality.
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
  dispute_status public.dispute_status
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
    (select d.status from disputes d where d.booking_id = b.id limit 1) as dispute_status
  from bookings b
  join talachero_profiles tp on tp.id = b.talachero_id
  join users tu on tu.id = tp.user_id
  join service_categories sc on sc.id = b.service_category_id
  left join availability_slots s on s.id = b.slot_id
  where b.client_id = auth.uid()
  order by b.created_at desc;
$$;

grant execute on function public.get_my_bookings() to authenticated;

-- ---- backfill: close disputes already settled by a refund -------------------
-- resolved_by is deliberately left NULL: no admin decided these, so
-- "resolved_by IS NULL" is the honest audit marker for a system reconciliation.
update public.disputes d
   set status      = 'refunded',
       resolved_at = now(),
       admin_note  = coalesce(
                       d.admin_note,
                       'Cerrada automáticamente: la reserva ya estaba reembolsada.')
  from public.bookings b
 where b.id = d.booking_id
   and d.status = 'open'
   and b.payment_status = 'refunded';
