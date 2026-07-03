-- Phase 2 · Migration 3 — availability, bookings, ledger, chat, reviews
-- PRD §6.3 (slot calendar + concurrency), §6.4 (immutable ledger), §7.

-- ---------------------------------------------------------------------------
-- availability_slots — calendar-of-slots model (PRD §6.3)
-- The GiST exclusion constraint makes it impossible to persist two overlapping
-- slots for the same talachero, at the database level.
-- ---------------------------------------------------------------------------
create table public.availability_slots (
  id           uuid primary key default gen_random_uuid(),
  talachero_id uuid not null references public.talachero_profiles(id) on delete cascade,
  start_time   timestamptz not null,
  end_time     timestamptz not null,
  status       public.slot_status not null default 'open',
  created_at   timestamptz not null default now(),
  constraint availability_slots_time_order check (end_time > start_time),
  constraint availability_slots_no_overlap exclude using gist (
    talachero_id with =,
    tstzrange(start_time, end_time) with &&
  )
);

create index availability_slots_talachero_idx
  on public.availability_slots (talachero_id, start_time);
create index availability_slots_open_idx
  on public.availability_slots (start_time) where status = 'open';

-- ---------------------------------------------------------------------------
-- bookings — full lifecycle (PRD §7, §8)
-- slot_id is nullable so a cancelled booking can release its slot without
-- losing the booking record.
-- ---------------------------------------------------------------------------
create table public.bookings (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references public.users(id) on delete restrict,
  talachero_id        uuid not null references public.talachero_profiles(id) on delete restrict,
  service_category_id uuid not null references public.service_categories(id),
  slot_id             uuid references public.availability_slots(id) on delete set null,
  status              public.booking_status not null default 'requested',
  price               numeric(10, 2),
  tip                 numeric(10, 2) not null default 0,
  currency            text not null default 'MXN',
  address             text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index bookings_client_idx    on public.bookings (client_id);
create index bookings_talachero_idx on public.bookings (talachero_id);
create index bookings_slot_idx      on public.bookings (slot_id);
create index bookings_status_idx    on public.bookings (status);

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- transactions — append-only money ledger (PRD §6.4)
-- No updated_at: rows are immutable events. UPDATE/DELETE are revoked in the
-- RLS migration. Balances are always derived, never stored.
-- ---------------------------------------------------------------------------
create table public.transactions (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings(id) on delete restrict,
  type         public.transaction_type not null,
  amount       numeric(12, 2) not null,
  currency     text not null default 'MXN',
  provider_ref text,                                  -- e.g. Stripe object id
  created_at   timestamptz not null default now()
);

create index transactions_booking_idx on public.transactions (booking_id);

-- ---------------------------------------------------------------------------
-- chat_threads / chat_messages — 1:1 thread per booking (PRD §7)
-- ---------------------------------------------------------------------------
create table public.chat_threads (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.chat_threads(id) on delete cascade,
  sender_id  uuid not null references public.users(id) on delete restrict,
  body       text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);

create index chat_messages_thread_idx on public.chat_messages (thread_id, created_at);

-- ---------------------------------------------------------------------------
-- reviews — bidirectional, one per (booking, author) (PRD §7, §9)
-- ---------------------------------------------------------------------------
create table public.reviews (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  author_id  uuid not null references public.users(id) on delete restrict,
  target_id  uuid not null references public.users(id) on delete restrict,
  rating     integer not null check (rating between 1 and 5),
  comment    text,
  created_at timestamptz not null default now(),
  constraint reviews_one_per_author unique (booking_id, author_id),
  constraint reviews_not_self check (author_id <> target_id)
);

create index reviews_target_idx on public.reviews (target_id);
