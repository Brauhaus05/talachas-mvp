-- Phase 2 · Migration 1 — extensions, enums, and reference tables
-- PRD §6.2 (multi-city/multi-currency from day one) and §7 (data model).

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
-- PostGIS: geospatial matching is the core of the product (PRD §6.2). Lives in
-- its own schema per Supabase convention so it never clutters `public`.
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
-- btree_gist lets a GiST exclusion constraint combine a scalar equality
-- (talachero_id) with a range overlap (&&) — used to prevent slot overlaps.
create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums (PRD §7)
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('client', 'talachero', 'admin');
create type public.verification_status as enum ('pending', 'verified', 'rejected');
create type public.slot_status as enum ('open', 'booked', 'blocked');
create type public.booking_status as enum (
  'requested', 'confirmed', 'in_progress', 'completed', 'cancelled'
);
create type public.transaction_type as enum ('charge', 'payout', 'refund', 'tip');

-- ---------------------------------------------------------------------------
-- Reference: cities
-- Schema carries currency/locale/timezone so pricing and scheduling stay
-- correct as we add markets — even though we launch CDMX-only.
-- ---------------------------------------------------------------------------
create table public.cities (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  country_code text not null,                    -- ISO 3166-1 alpha-2
  currency     text not null,                    -- ISO 4217
  locale       text not null,                    -- BCP-47
  timezone     text not null,                    -- IANA tz database name
  center_point extensions.geography(Point, 4326),
  created_at   timestamptz not null default now()
);

insert into public.cities (slug, name, country_code, currency, locale, timezone, center_point)
values (
  'cdmx',
  'Ciudad de México',
  'MX',
  'MXN',
  'es-MX',
  'America/Mexico_City',
  extensions.ST_SetSRID(extensions.ST_MakePoint(-99.1332, 19.4326), 4326)::extensions.geography
);

-- ---------------------------------------------------------------------------
-- Reference: service_categories
-- `slug` mirrors ServiceSlug in src/lib/mock/services.ts; `name_key` and
-- `icon` are consumed by the i18n catalog and lucide-react respectively.
-- ---------------------------------------------------------------------------
create table public.service_categories (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name_key   text not null,        -- i18n key, e.g. "services.handyman"
  icon       text not null,        -- lucide-react icon name
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);

insert into public.service_categories (slug, name_key, icon, sort_order) values
  ('handyman',           'services.handyman',           'Wrench',       1),
  ('furniture_assembly', 'services.furniture_assembly', 'Hammer',       2),
  ('cleaning',           'services.cleaning',           'Sparkles',     3),
  ('moving',             'services.moving',             'Truck',        4),
  ('tv_mount',           'services.tv_mount',           'Tv',           5),
  ('gardening',          'services.gardening',          'Leaf',         6),
  ('delivery',           'services.delivery',           'PackageCheck', 7),
  ('painting',           'services.painting',           'PaintRoller',  8);
