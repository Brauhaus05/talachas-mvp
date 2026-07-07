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
