-- Phase 3 · Migration 7 — booking lifecycle functions (PRD §6.3, §8)
-- SECURITY DEFINER because these transition state across tables (bookings +
-- availability_slots) that a client/talachero cannot both write under RLS.
-- Each validates the caller via auth.uid(). Concurrency is handled with
-- SELECT ... FOR UPDATE on the slot row, so two clients racing the same slot
-- serialize and the loser gets a clean 'slot_unavailable'.

-- ---------------------------------------------------------------------------
-- create_booking — client books a slot. Returns the new booking id.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- respond_to_booking — talachero accepts or rejects a pending request.
-- ---------------------------------------------------------------------------
create or replace function public.respond_to_booking(
  p_booking_id uuid,
  p_accept     boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_owner  uuid;
  v_status public.booking_status;
  v_slot   uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select tp.user_id, b.status, b.slot_id
    into v_owner, v_status, v_slot
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
  if v_status <> 'requested' then
    raise exception 'invalid_state';
  end if;

  if p_accept then
    update bookings set status = 'confirmed' where id = p_booking_id;
  else
    update bookings set status = 'cancelled' where id = p_booking_id;
    if v_slot is not null then
      update availability_slots set status = 'open' where id = v_slot;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_booking — either party cancels; releases the slot back to open.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_client uuid;
  v_owner  uuid;
  v_status public.booking_status;
  v_slot   uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select b.client_id, tp.user_id, b.status, b.slot_id
    into v_client, v_owner, v_status, v_slot
    from bookings b
    join talachero_profiles tp on tp.id = b.talachero_id
    where b.id = p_booking_id
    for update of b;

  if not found then
    raise exception 'not_found';
  end if;
  if v_uid not in (v_client, v_owner) then
    raise exception 'not_authorized';
  end if;
  if v_status not in ('requested', 'confirmed') then
    raise exception 'invalid_state';
  end if;

  update bookings set status = 'cancelled' where id = p_booking_id;
  if v_slot is not null then
    update availability_slots set status = 'open' where id = v_slot;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Booking lists (curated projections — the other party's name is behind RLS).
-- ---------------------------------------------------------------------------
create or replace function public.get_my_bookings()
returns table (
  id             uuid,
  status         public.booking_status,
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
    b.id, b.status, b.price, b.currency, b.address, b.created_at,
    tp.id, tu.full_name, sc.slug, s.start_time
  from bookings b
  join talachero_profiles tp on tp.id = b.talachero_id
  join users tu on tu.id = tp.user_id
  join service_categories sc on sc.id = b.service_category_id
  left join availability_slots s on s.id = b.slot_id
  where b.client_id = auth.uid()
  order by b.created_at desc;
$$;

create or replace function public.get_talachero_bookings()
returns table (
  id           uuid,
  status       public.booking_status,
  price        numeric,
  currency     text,
  address      text,
  created_at   timestamptz,
  client_name  text,
  service_slug text,
  slot_start   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id, b.status, b.price, b.currency, b.address, b.created_at,
    cu.full_name, sc.slug, s.start_time
  from bookings b
  join talachero_profiles tp on tp.id = b.talachero_id
  join users cu on cu.id = b.client_id
  join service_categories sc on sc.id = b.service_category_id
  left join availability_slots s on s.id = b.slot_id
  where tp.user_id = auth.uid()
  order by b.created_at desc;
$$;

grant execute on function public.create_booking(uuid, uuid, uuid, integer, text, text) to authenticated;
grant execute on function public.respond_to_booking(uuid, boolean) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.get_my_bookings() to authenticated;
grant execute on function public.get_talachero_bookings() to authenticated;
