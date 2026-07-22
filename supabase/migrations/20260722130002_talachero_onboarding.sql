-- Self-service talachero onboarding (Sprint 2) — part 2 of 2.
-- Admin-review gate: talachero completes profile + availability, submits, an
-- admin approves (-> verified, shows in directory) or rejects (-> rejected +
-- reason, can re-submit). All transitions go through SECURITY DEFINER RPCs
-- (verification columns are REVOKE UPDATE from authenticated). Mirrors the
-- disputes queue (raise_dispute / admin_list_disputes / admin_resolve_dispute).

alter table public.talachero_profiles
  add column if not exists rejection_reason text,
  add column if not exists submitted_at    timestamptz;

-- ---- submit_talachero_for_review (talachero) --------------------------------
create or replace function public.submit_talachero_for_review()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_status  public.verification_status;
  v_rate    numeric;
begin
  select id, verification_status, hourly_rate
    into v_id, v_status, v_rate
    from public.talachero_profiles
    where user_id = auth.uid();
  if v_id is null then
    raise exception 'not_authorized';
  end if;

  if v_status = 'in_review' then
    raise exception 'already_submitted';
  end if;
  if v_status = 'verified' then
    raise exception 'already_verified';
  end if;

  if v_rate is null
     or not exists (select 1 from public.talachero_services ts
                    where ts.talachero_id = v_id) then
    raise exception 'profile_incomplete';
  end if;

  if not exists (select 1 from public.availability_slots s
                 where s.talachero_id = v_id
                   and s.status = 'open'
                   and s.start_time >= now()) then
    raise exception 'no_availability';
  end if;

  update public.talachero_profiles
     set verification_status = 'in_review',
         submitted_at        = now(),
         rejection_reason    = null
   where id = v_id;
end;
$$;
revoke all on function public.submit_talachero_for_review() from public;
grant execute on function public.submit_talachero_for_review() to authenticated;

-- ---- admin_list_verifications (admin read) ---------------------------------
create or replace function public.admin_list_verifications()
returns table (
  talachero_id    uuid,
  full_name       text,
  bio             text,
  hourly_rate     numeric,
  currency        text,
  service_slugs   text[],
  slot_count      bigint,
  charges_enabled boolean,
  submitted_at    timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  return query
    select tp.id, tu.full_name, tp.bio, tp.hourly_rate, tp.currency,
           coalesce(array_agg(sc.slug order by sc.slug)
                    filter (where sc.slug is not null), '{}') as service_slugs,
           (select count(*) from public.availability_slots s
             where s.talachero_id = tp.id
               and s.status = 'open' and s.start_time >= now()) as slot_count,
           tp.charges_enabled,
           tp.submitted_at
      from public.talachero_profiles tp
      join public.users tu on tu.id = tp.user_id
      left join public.talachero_services ts on ts.talachero_id = tp.id
      left join public.service_categories sc on sc.id = ts.service_category_id
     where tp.verification_status = 'in_review'
     group by tp.id, tu.full_name, tp.bio, tp.hourly_rate, tp.currency,
              tp.charges_enabled, tp.submitted_at
     order by tp.submitted_at asc;
end;
$$;
grant execute on function public.admin_list_verifications() to authenticated;

-- ---- admin_review_talachero (admin write) ----------------------------------
create or replace function public.admin_review_talachero(
  p_talachero_id uuid,
  p_approve      boolean,
  p_reason       text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.verification_status;
  v_reason text;
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  select verification_status into v_status
    from public.talachero_profiles
    where id = p_talachero_id
    for update;
  if not found then
    raise exception 'talachero_not_found';
  end if;
  if v_status <> 'in_review' then
    raise exception 'not_in_review';
  end if;

  if p_approve then
    update public.talachero_profiles
       set verification_status = 'verified',
           rejection_reason    = null
     where id = p_talachero_id;
  else
    v_reason := nullif(btrim(coalesce(p_reason, '')), '');
    if v_reason is null then
      raise exception 'empty_reason';
    end if;
    update public.talachero_profiles
       set verification_status = 'rejected',
           rejection_reason    = v_reason
     where id = p_talachero_id;
  end if;
end;
$$;
grant execute on function public.admin_review_talachero(uuid, boolean, text) to authenticated;
