-- Phase 3 · Migration 5 — neighborhoods (colonias) for location matching
-- MVP location UX: client and talachero pick a CDMX colonia (each has a point);
-- search matches via ST_DWithin(coverage center, colonia point, radius). No map.

create table public.neighborhoods (
  id           uuid primary key default gen_random_uuid(),
  city_id      uuid not null references public.cities(id),
  slug         text not null unique,
  name         text not null,
  alcaldia     text,                                  -- CDMX borough
  center_point extensions.geography(Point, 4326) not null,
  created_at   timestamptz not null default now()
);

create index neighborhoods_center_idx
  on public.neighborhoods using gist (center_point);

alter table public.neighborhoods enable row level security;
create policy "neighborhoods are readable by everyone"
  on public.neighborhoods for select using (true);

-- Talachero profile gains a home neighborhood (display + a sensible coverage
-- center default) and a jobs-completed counter (display stat).
alter table public.talachero_profiles
  add column neighborhood_id uuid references public.neighborhoods(id),
  add column jobs_completed  integer not null default 0;

-- Seed CDMX colonias (points are approximate colonia centroids, lng/lat).
insert into public.neighborhoods (city_id, slug, name, alcaldia, center_point)
select
  (select id from public.cities where slug = 'cdmx'),
  v.slug, v.name, v.alcaldia,
  extensions.ST_SetSRID(extensions.ST_MakePoint(v.lng, v.lat), 4326)::extensions.geography
from (values
  ('roma-norte',     'Roma Norte',     'Cuauhtémoc',      -99.1655, 19.4194),
  ('condesa',        'Condesa',        'Cuauhtémoc',      -99.1750, 19.4110),
  ('del-valle',      'Del Valle',      'Benito Juárez',   -99.1650, 19.3900),
  ('coyoacan',       'Coyoacán',       'Coyoacán',        -99.1620, 19.3500),
  ('polanco',        'Polanco',        'Miguel Hidalgo',  -99.1930, 19.4330),
  ('narvarte',       'Narvarte',       'Benito Juárez',   -99.1550, 19.3950),
  ('alvaro-obregon', 'Álvaro Obregón', 'Álvaro Obregón',  -99.2030, 19.3600),
  ('iztapalapa',     'Iztapalapa',     'Iztapalapa',      -99.0710, 19.3570),
  ('cuauhtemoc',     'Cuauhtémoc',     'Cuauhtémoc',      -99.1500, 19.4326),
  ('miguel-hidalgo', 'Miguel Hidalgo', 'Miguel Hidalgo',  -99.2000, 19.4300)
) as v(slug, name, alcaldia, lng, lat);
