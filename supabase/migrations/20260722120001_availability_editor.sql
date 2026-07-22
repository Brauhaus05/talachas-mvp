-- Talachero self-service availability editor (Sprint 2).
-- Approach A: the talachero directly opens/closes concrete 1-hour
-- availability_slots rows. availability_slots already has a permissive owner
-- RLS policy, but every write goes through these SECURITY DEFINER functions so
-- the CDMX->UTC conversion stays in Postgres (like the seed) and ownership +
-- bounds + the booked-guard are validated atomically. The GiST exclusion
-- constraint makes a duplicate/overlapping slot impossible; we treat that as an
-- idempotent no-op rather than an error.

-- open_availability_slot: open a 1-hour slot at a CDMX civil (date, hour).
create or replace function public.open_availability_slot(
  p_date date,
  p_hour int
) returns table(id uuid, start_time timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_talachero_id uuid;
  v_today        date;
  v_start        timestamptz;
  v_end          timestamptz;
  v_id           uuid;
begin
  select tp.id into v_talachero_id
  from public.talachero_profiles tp
  where tp.user_id = auth.uid();
  if v_talachero_id is null then
    raise exception 'not_authorized';
  end if;

  if p_hour < 8 or p_hour > 19 then
    raise exception 'out_of_range';
  end if;

  v_today := (now() at time zone 'America/Mexico_City')::date;
  if p_date < v_today or p_date > v_today + 14 then
    raise exception 'out_of_range';
  end if;

  -- Interpret (date, hour) as a CDMX wall-clock, store the absolute instant.
  v_start := (p_date + make_interval(hours => p_hour)) at time zone 'America/Mexico_City';
  v_end   := v_start + interval '1 hour';

  begin
    insert into public.availability_slots (talachero_id, start_time, end_time, status)
    values (v_talachero_id, v_start, v_end, 'open')
    returning availability_slots.id into v_id;
  exception when exclusion_violation or unique_violation then
    -- A slot (open or booked) already exists at this instant: idempotent open.
    select s.id into v_id
    from public.availability_slots s
    where s.talachero_id = v_talachero_id and s.start_time = v_start;
  end;

  return query
  select s.id, s.start_time
  from public.availability_slots s
  where s.id = v_id;
end;
$$;

-- close_availability_slot: remove an OPEN owned slot. Booked slots are never
-- removed here (the talachero cancels/rejects the booking instead).
create or replace function public.close_availability_slot(p_slot_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_talachero_id uuid;
  v_status       public.slot_status;
begin
  select tp.id into v_talachero_id
  from public.talachero_profiles tp
  where tp.user_id = auth.uid();
  if v_talachero_id is null then
    raise exception 'not_authorized';
  end if;

  -- Lock the slot row so a concurrent create_booking can't book it between the
  -- status check and the delete (mirrors create_booking's SELECT ... FOR UPDATE).
  select s.status into v_status
  from public.availability_slots s
  where s.id = p_slot_id and s.talachero_id = v_talachero_id
  for update;

  if v_status is null then
    raise exception 'not_authorized';  -- not owned / does not exist
  end if;
  if v_status <> 'open' then
    raise exception 'slot_booked';
  end if;

  delete from public.availability_slots
  where id = p_slot_id and talachero_id = v_talachero_id and status = 'open';
end;
$$;

revoke all on function public.open_availability_slot(date, int) from public;
grant execute on function public.open_availability_slot(date, int) to authenticated;
revoke all on function public.close_availability_slot(uuid) from public;
grant execute on function public.close_availability_slot(uuid) to authenticated;
