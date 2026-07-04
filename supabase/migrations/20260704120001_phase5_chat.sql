-- Phase 5A · Chat read-tracking, thread + unread RPCs, realtime publication.
-- Reuses existing chat_threads / chat_messages (Phase 2 migration 3).

-- ---------------------------------------------------------------------------
-- chat_reads — per-participant read watermark (one row per thread+user).
-- Unread for a user = messages in their threads with created_at > last_read_at
-- and sender_id <> user.
-- ---------------------------------------------------------------------------
create table public.chat_reads (
  thread_id    uuid not null references public.chat_threads(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

alter table public.chat_reads enable row level security;

-- A read marker is readable/writable only by its owner, who must be a
-- participant of the underlying booking.
create policy "own read markers"
  on public.chat_reads for all
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.chat_threads t
      where t.id = thread_id and public.is_booking_participant(t.booking_id)
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.chat_threads t
      where t.id = thread_id and public.is_booking_participant(t.booking_id)
    )
  );

grant select, insert, update on public.chat_reads to authenticated;

-- ---------------------------------------------------------------------------
-- get_or_create_thread — chat_threads has no INSERT policy, so thread creation
-- goes through this SECURITY DEFINER helper. Idempotent on unique(booking_id).
-- ---------------------------------------------------------------------------
create function public.get_or_create_thread(p_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_thread uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_booking_participant(p_booking_id) then
    raise exception 'not_authorized';
  end if;

  insert into chat_threads (booking_id)
  values (p_booking_id)
  on conflict (booking_id) do nothing;

  select id into v_thread from chat_threads where booking_id = p_booking_id;
  return v_thread;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tighten message INSERT: block new messages on a cancelled booking
-- (read-only rule; the UI also hides the composer).
-- ---------------------------------------------------------------------------
drop policy "participants send messages in their thread" on public.chat_messages;

create policy "participants send messages in their thread"
  on public.chat_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.chat_threads t
      join public.bookings b on b.id = t.booking_id
      where t.id = thread_id
        and public.is_booking_participant(t.booking_id)
        and b.status <> 'cancelled'
    )
  );

-- ---------------------------------------------------------------------------
-- Unread counters (caller-scoped via is_booking_participant + auth.uid()).
-- ---------------------------------------------------------------------------
create function public.get_unread_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from chat_messages m
  join chat_threads t on t.id = m.thread_id
  left join chat_reads r on r.thread_id = t.id and r.user_id = auth.uid()
  where public.is_booking_participant(t.booking_id)
    and m.sender_id <> auth.uid()
    and m.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz);
$$;

create function public.get_unread_map()
returns table (booking_id uuid, unread integer)
language sql
stable
security definer
set search_path = public
as $$
  select t.booking_id, count(*)::int
  from chat_messages m
  join chat_threads t on t.id = m.thread_id
  left join chat_reads r on r.thread_id = t.id and r.user_id = auth.uid()
  where public.is_booking_participant(t.booking_id)
    and m.sender_id <> auth.uid()
    and m.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)
  group by t.booking_id;
$$;

grant execute on function public.get_or_create_thread(uuid) to authenticated;
grant execute on function public.get_unread_count() to authenticated;
grant execute on function public.get_unread_map() to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: broadcast new messages. RLS is still enforced on the stream — a
-- user only receives rows they can SELECT.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.chat_messages;
