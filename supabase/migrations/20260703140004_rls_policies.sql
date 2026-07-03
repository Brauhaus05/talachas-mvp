-- Phase 2 · Migration 4 — Row Level Security (PRD §6.9)
-- Default posture: RLS on for every table, deny-by-default, then grant the
-- minimum each role needs. Admin access goes through SECURITY DEFINER helpers
-- (and the service role, which bypasses RLS entirely for server-side ops).

-- ---------------------------------------------------------------------------
-- Helper predicates. SECURITY DEFINER + a pinned search_path means they run as
-- the owner and bypass RLS on the tables they read, which avoids the recursion
-- you get when a policy on `users` queries `users`.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.owns_talachero(profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.talachero_profiles
    where id = profile_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_booking_participant(b_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bookings b
    join public.talachero_profiles tp on tp.id = b.talachero_id
    where b.id = b_id
      and (b.client_id = auth.uid() or tp.user_id = auth.uid())
  );
$$;

-- ===========================================================================
-- Reference tables — world-readable, no client writes.
-- ===========================================================================
alter table public.cities enable row level security;
alter table public.service_categories enable row level security;

create policy "cities are readable by everyone"
  on public.cities for select using (true);
create policy "service categories are readable by everyone"
  on public.service_categories for select using (true);

-- ===========================================================================
-- users — own row (+ admin). Role cannot be self-assigned: we revoke UPDATE
-- and re-grant it only on the safe columns, so the `role` column stays
-- server-only (service role bypasses this).
-- ===========================================================================
alter table public.users enable row level security;

create policy "users can read their own row"
  on public.users for select
  using (id = auth.uid() or public.is_admin());

create policy "users can update their own row"
  on public.users for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

revoke update on public.users from authenticated;
grant update (email, phone, full_name, locale, city_id) on public.users to authenticated;

-- ===========================================================================
-- talachero_profiles — verified profiles are public; owner/admin see & edit.
-- ===========================================================================
alter table public.talachero_profiles enable row level security;

create policy "verified profiles are public; owners see their own"
  on public.talachero_profiles for select
  using (
    verification_status = 'verified'
    or user_id = auth.uid()
    or public.is_admin()
  );

create policy "talacheros insert their own profile"
  on public.talachero_profiles for insert
  with check (user_id = auth.uid());

create policy "talacheros update their own profile"
  on public.talachero_profiles for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- ===========================================================================
-- talachero_services — public read; owner/admin manage.
-- ===========================================================================
alter table public.talachero_services enable row level security;

create policy "talachero services are public"
  on public.talachero_services for select using (true);

create policy "talacheros manage their own services"
  on public.talachero_services for all
  using (public.owns_talachero(talachero_id) or public.is_admin())
  with check (public.owns_talachero(talachero_id) or public.is_admin());

-- ===========================================================================
-- availability_slots — public read (clients browse); owner/admin manage.
-- ===========================================================================
alter table public.availability_slots enable row level security;

create policy "availability is public"
  on public.availability_slots for select using (true);

create policy "talacheros manage their own slots"
  on public.availability_slots for all
  using (public.owns_talachero(talachero_id) or public.is_admin())
  with check (public.owns_talachero(talachero_id) or public.is_admin());

-- ===========================================================================
-- bookings — only the two parties (and admin) can see or touch a booking.
-- ===========================================================================
alter table public.bookings enable row level security;

create policy "participants read their bookings"
  on public.bookings for select
  using (
    client_id = auth.uid()
    or public.owns_talachero(talachero_id)
    or public.is_admin()
  );

create policy "clients create their own bookings"
  on public.bookings for insert
  with check (client_id = auth.uid());

create policy "participants update their bookings"
  on public.bookings for update
  using (
    client_id = auth.uid()
    or public.owns_talachero(talachero_id)
    or public.is_admin()
  )
  with check (
    client_id = auth.uid()
    or public.owns_talachero(talachero_id)
    or public.is_admin()
  );

-- ===========================================================================
-- transactions — append-only ledger (PRD §6.4). Readable by participants;
-- writes happen only via the service role. UPDATE/DELETE are revoked so the
-- ledger is immutable even if a future policy is added by mistake.
-- ===========================================================================
alter table public.transactions enable row level security;

create policy "participants read booking transactions"
  on public.transactions for select
  using (public.is_booking_participant(booking_id) or public.is_admin());

revoke insert, update, delete on public.transactions from authenticated, anon;

-- ===========================================================================
-- chat — only booking participants.
-- ===========================================================================
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;

create policy "participants read their chat thread"
  on public.chat_threads for select
  using (public.is_booking_participant(booking_id) or public.is_admin());

create policy "participants read messages in their thread"
  on public.chat_messages for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.chat_threads t
      where t.id = thread_id and public.is_booking_participant(t.booking_id)
    )
  );

create policy "participants send messages in their thread"
  on public.chat_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.chat_threads t
      where t.id = thread_id and public.is_booking_participant(t.booking_id)
    )
  );

-- ===========================================================================
-- reviews — public to read (shown on profiles); authored by a booking
-- participant about the other party.
-- ===========================================================================
alter table public.reviews enable row level security;

create policy "reviews are public"
  on public.reviews for select using (true);

create policy "participants author their own reviews"
  on public.reviews for insert
  with check (
    author_id = auth.uid()
    and public.is_booking_participant(booking_id)
  );
