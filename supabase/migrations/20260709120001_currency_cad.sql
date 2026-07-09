-- Move the app to Canadian dollars: flip every `currency` column default from
-- MXN to CAD, backfill existing rows, and update create_booking's insert
-- fallback (the explicit INSERT bypasses the column default). Non-destructive.
-- Spec: docs/superpowers/specs/2026-07-09-cad-currency-migration-design.md

-- 1. Column defaults -> CAD
alter table public.talachero_profiles alter column currency set default 'CAD';
alter table public.bookings           alter column currency set default 'CAD';
alter table public.transactions       alter column currency set default 'CAD';

-- 2. Backfill mutable rows. bookings.currency IS shown to users (admin tables,
--    email receipts via formatMoney), so backfilling prevents stale MX$ on
--    pre-migration rows. talachero_profiles.currency and cities.currency are
--    unread today but flipped for consistency. NOT transactions: it is the
--    immutable append-only ledger (PRD §6.4) — historical rows keep the
--    currency actually charged.
update public.talachero_profiles set currency = 'CAD' where currency = 'MXN';
update public.bookings           set currency = 'CAD' where currency = 'MXN';
update public.cities             set currency = 'CAD' where slug = 'cdmx';

-- 3. create_booking: fallback 'MXN' -> 'CAD'. Signature/return unchanged, so
--    CREATE OR REPLACE preserves the existing grant (no re-grant needed).
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
    coalesce(v_currency, 'CAD'),
    p_address, p_notes
  )
  returning id into v_booking_id;

  update availability_slots set status = 'booked' where id = p_slot_id;

  return v_booking_id;
end;
$$;
