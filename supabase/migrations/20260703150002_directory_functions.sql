-- Phase 3 · Migration 6 — public directory functions
-- Talachero names (users.full_name) and review authors are behind users RLS
-- (own-row only). These SECURITY DEFINER functions return a curated, safe
-- projection (no email/phone) for verified talacheros so the public directory
-- and profile pages can render. This is also the seam the location-based search
-- will extend (ST_DWithin) in the booking milestone.

-- List / detail: pass p_id = null for the full verified directory, or a profile
-- id for a single card. One row per talachero, services aggregated.
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
  group by tp.id, us.full_name, n.name;
$$;

-- Reviews for a profile, with the (public) author name.
create or replace function public.get_talachero_reviews(p_id uuid)
returns table (
  id          uuid,
  author_name text,
  rating      integer,
  comment     text,
  created_at  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, coalesce(au.full_name, ''), r.rating, r.comment, r.created_at
  from reviews r
  join talachero_profiles tp on tp.user_id = r.target_id
  join users au on au.id = r.author_id
  where tp.id = p_id
  order by r.created_at desc;
$$;

grant execute on function public.list_talacheros(uuid) to anon, authenticated;
grant execute on function public.get_talachero_reviews(uuid) to anon, authenticated;
