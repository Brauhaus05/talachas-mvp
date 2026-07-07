-- Phase 6 · create_review — client leaves a review on a completed booking.
-- SECURITY DEFINER (validates auth.uid() internally), mirroring the other
-- booking write RPCs. Client→talachero direction only; target derived from the
-- booking's talachero profile. One review per (booking, author) enforced by the
-- reviews_one_per_author unique constraint → typed 'already_reviewed'.

create or replace function public.create_review(
  p_booking_id uuid,
  p_rating     integer,
  p_comment    text
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
  v_tal_id  uuid;
  v_target  uuid;
  v_review  uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_rating';
  end if;

  select client_id, status, talachero_id
    into v_client, v_status, v_tal_id
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

  select user_id into v_target from talachero_profiles where id = v_tal_id;

  begin
    insert into reviews (booking_id, author_id, target_id, rating, comment)
    values (p_booking_id, v_uid, v_target, p_rating, nullif(trim(p_comment), ''))
    returning id into v_review;
  exception when unique_violation then
    raise exception 'already_reviewed';
  end;

  return v_review;
end;
$$;

grant execute on function public.create_review(uuid, integer, text) to authenticated;

-- Force all review writes through create_review (SECURITY DEFINER, runs as
-- owner → bypasses this revoke). Without this, the pre-existing "participants
-- author their own reviews" INSERT policy would let a client (or a talachero
-- participant) insert a review directly, bypassing the completed-only /
-- client-only / correct-target checks above. Mirrors how bookings mutations are
-- forced through RPCs. The now-redundant INSERT policy is dropped for clarity.
drop policy if exists "participants author their own reviews" on public.reviews;
revoke insert on public.reviews from authenticated;
