-- Phase 2 · Migration 2 — users, talachero profiles, signup trigger
-- PRD §7. Coverage area is modeled as center point + radius (MVP decision);
-- PostGIS is enabled so a polygon column can be added post-MVP without a
-- disruptive migration.

-- ---------------------------------------------------------------------------
-- Shared helper: keep updated_at fresh on any table that has it.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- users — application profile extending auth.users (PRD §7)
-- ---------------------------------------------------------------------------
create table public.users (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       public.user_role not null default 'client',
  email      text,
  phone      text,
  full_name  text,
  locale     text not null default 'es',
  city_id    uuid references public.cities(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index users_role_idx on public.users (role);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- Post-signup trigger: mirror the new auth.users row into public.users,
-- reading role/locale/full_name/phone from the signup metadata. Runs as
-- SECURITY DEFINER because the auth schema is not writable by the anon role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_role public.user_role;
begin
  -- Coerce the metadata role; anything unexpected falls back to 'client'.
  -- 'admin' can never be self-assigned at signup.
  begin
    meta_role := (new.raw_user_meta_data ->> 'role')::public.user_role;
  exception when others then
    meta_role := 'client';
  end;
  if meta_role is null or meta_role = 'admin' then
    meta_role := 'client';
  end if;

  insert into public.users (id, role, email, phone, full_name, locale)
  values (
    new.id,
    meta_role,
    new.email,
    coalesce(new.phone, new.raw_user_meta_data ->> 'phone'),
    new.raw_user_meta_data ->> 'full_name',
    coalesce(new.raw_user_meta_data ->> 'locale', 'es')
  );

  -- A talachero gets an empty profile shell immediately so onboarding
  -- (Phase 3) has a row to fill in.
  if meta_role = 'talachero' then
    insert into public.talachero_profiles (user_id)
    values (new.id);
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- talachero_profiles — 1:1 with a talachero user (PRD §7)
-- ---------------------------------------------------------------------------
create table public.talachero_profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references public.users(id) on delete cascade,
  bio                 text,
  hourly_rate         numeric(10, 2),
  currency            text not null default 'MXN',
  city_id             uuid references public.cities(id),
  -- Coverage area: center + radius for MVP. ST_DWithin(center_point, loc, r)
  -- answers "does this talachero serve this address?".
  center_point        extensions.geography(Point, 4326),
  radius_meters       integer check (radius_meters is null or radius_meters > 0),
  verification_status public.verification_status not null default 'pending',
  portfolio_photos    text[] not null default '{}',
  years_experience    integer,
  rating_avg          numeric(3, 2) not null default 0,
  rating_count        integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Spatial index on the coverage center for radius search (Phase 3).
create index talachero_profiles_center_idx
  on public.talachero_profiles using gist (center_point);
create index talachero_profiles_verification_idx
  on public.talachero_profiles (verification_status);

create trigger talachero_profiles_set_updated_at
  before update on public.talachero_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- talachero_services — which categories a talachero offers (M:N)
-- A join table (not an array) keeps referential integrity with
-- service_categories and lets search filter/join cleanly.
-- ---------------------------------------------------------------------------
create table public.talachero_services (
  talachero_id        uuid not null references public.talachero_profiles(id) on delete cascade,
  service_category_id uuid not null references public.service_categories(id) on delete cascade,
  is_primary          boolean not null default false,
  primary key (talachero_id, service_category_id)
);

create index talachero_services_category_idx
  on public.talachero_services (service_category_id);
