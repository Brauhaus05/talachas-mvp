-- Phase 4 · Migration 8 — Stripe Connect + payments fields (PRD §6.4, §6.5)
-- Money-related columns are written only by the server (service role) or the
-- webhook — never by the client — so we revoke UPDATE on them from the
-- authenticated role and route all changes through trusted paths.

-- ---------------------------------------------------------------------------
-- talachero_profiles: Connect account + capability flags
-- ---------------------------------------------------------------------------
alter table public.talachero_profiles
  add column stripe_account_id text unique,
  add column charges_enabled   boolean not null default false,
  add column payouts_enabled   boolean not null default false;

-- Lock down who can write which profile columns: the talachero may edit their
-- own presentational fields, but Stripe state and verification_status are
-- server-managed. (Table-level UPDATE can't be revoked per-column, so revoke
-- then re-grant the safe columns.)
revoke update on public.talachero_profiles from authenticated;
grant update (
  bio, hourly_rate, currency, city_id, center_point, radius_meters,
  portfolio_photos, years_experience, neighborhood_id
) on public.talachero_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- bookings: payment linkage. All booking mutations already flow through
-- SECURITY DEFINER functions, so we revoke direct UPDATE from authenticated
-- entirely; payment columns are then implicitly server-only too.
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column stripe_payment_intent_id text,
  add column tip_payment_intent_id    text,
  add column payment_status           text not null default 'none'
    check (payment_status in ('none', 'authorized', 'captured', 'refunded', 'failed'));

revoke update on public.bookings from authenticated;

-- ---------------------------------------------------------------------------
-- stripe_events: webhook idempotency ledger. Written by the service role only;
-- RLS on with no policies denies all client access.
-- ---------------------------------------------------------------------------
create table public.stripe_events (
  id          text primary key,          -- Stripe event id (evt_...)
  type        text not null,
  received_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
