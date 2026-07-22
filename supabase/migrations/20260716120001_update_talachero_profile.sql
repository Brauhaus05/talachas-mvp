-- Talachero self-service profile editor (Sprint 2).
-- Direct UPDATE on talachero_profiles is revoked from `authenticated`
-- (20260703170001_stripe_fields.sql), so every profile mutation goes through
-- this SECURITY DEFINER RPC. It validates auth.uid() owns the profile, writes
-- ONLY the editable columns (bio, hourly_rate, years_experience), and replaces
-- the talachero_services set atomically. Verification/stripe/rating columns are
-- never touched here.
create or replace function public.update_talachero_profile(
  p_bio               text,
  p_hourly_rate       numeric,
  p_years_experience  integer,
  p_service_slugs     text[],
  p_primary_slug      text
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_talachero_id uuid;
  v_bio          text;
  v_matched      integer;
  v_primary_id   uuid;
begin
  select id into v_talachero_id
  from public.talachero_profiles
  where user_id = auth.uid();

  if v_talachero_id is null then
    raise exception 'no_profile';
  end if;

  -- bio: optional, trimmed, <= 600 chars (empty -> NULL)
  v_bio := nullif(btrim(coalesce(p_bio, '')), '');
  if v_bio is not null and char_length(v_bio) > 600 then
    raise exception 'bio_too_long';
  end if;

  -- hourly_rate: required, 50..2000
  if p_hourly_rate is null or p_hourly_rate < 50 or p_hourly_rate > 2000 then
    raise exception 'rate_out_of_range';
  end if;

  -- years_experience: optional, 0..60
  if p_years_experience is not null
     and (p_years_experience < 0 or p_years_experience > 60) then
    raise exception 'experience_invalid';
  end if;

  -- services: >= 1, every slug must resolve to a real category
  if p_service_slugs is null or array_length(p_service_slugs, 1) is null then
    raise exception 'no_service';
  end if;

  select count(distinct sc.id) into v_matched
  from public.service_categories sc
  where sc.slug = any(p_service_slugs);

  if v_matched <> cardinality(array(select distinct unnest(p_service_slugs))) then
    raise exception 'no_service';
  end if;

  -- primary: required, must be one of the selected slugs
  if p_primary_slug is null or not (p_primary_slug = any(p_service_slugs)) then
    raise exception 'primary_not_selected';
  end if;
  select id into v_primary_id
  from public.service_categories
  where slug = p_primary_slug;

  update public.talachero_profiles
  set bio              = v_bio,
      hourly_rate      = p_hourly_rate,
      years_experience = p_years_experience
  where id = v_talachero_id;

  delete from public.talachero_services where talachero_id = v_talachero_id;

  insert into public.talachero_services (talachero_id, service_category_id, is_primary)
  select v_talachero_id, sc.id, (sc.id = v_primary_id)
  from public.service_categories sc
  where sc.slug = any(p_service_slugs);
end;
$$;

revoke all on function public.update_talachero_profile(text, numeric, integer, text[], text) from public;
grant execute on function public.update_talachero_profile(text, numeric, integer, text[], text) to authenticated;
