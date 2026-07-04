-- Phase 4B · Migration 9 — complete_booking (PRD §8)
-- Talachero marks a confirmed booking as completed; the app then captures the
-- authorized PaymentIntent. SECURITY DEFINER so the state transition is
-- validated centrally, like the other booking lifecycle functions.

create or replace function public.complete_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_owner  uuid;
  v_status public.booking_status;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select tp.user_id, b.status
    into v_owner, v_status
    from bookings b
    join talachero_profiles tp on tp.id = b.talachero_id
    where b.id = p_booking_id
    for update of b;

  if not found then
    raise exception 'not_found';
  end if;
  if v_owner <> v_uid then
    raise exception 'not_authorized';
  end if;
  if v_status <> 'confirmed' then
    raise exception 'invalid_state';
  end if;

  update bookings set status = 'completed' where id = p_booking_id;
end;
$$;

grant execute on function public.complete_booking(uuid) to authenticated;
