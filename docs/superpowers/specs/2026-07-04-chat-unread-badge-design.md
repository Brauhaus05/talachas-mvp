# Design — Phase 5A: 1:1 chat + in-app unread badge

**Date:** 2026-07-04
**Status:** Approved (design) — awaiting spec review before planning
**Related:** plan.md §Phase 5; prd.md §6.6 (chat + notifications), §7 (data model); HANDOFF "Chat provider (Phase 5): default Supabase Realtime"

## Scope

Phase 5 ("chat + notifications") is split into two independent sub-projects. **This spec covers 5A only: real-time 1:1 chat per booking + the in-app unread badge.** Email notifications (Resend, event fan-out) are **Phase 5B — a separate spec**, built afterward.

**In scope:** one chat thread per booking; live messaging via Supabase Realtime; per-participant read tracking; an unread badge in the top nav + per-booking unread counts on booking cards; bilingual UI.

**Out of scope (YAGNI):** typing indicators, attachments/images, message edit/delete, push/SMS/email, a messages inbox, and a live-updating nav badge (the badge is server-computed on navigation).

## Decisions (locked)

- **Provider:** Supabase Realtime (per HANDOFF).
- **UI placement:** a dedicated **per-booking chat page** at `/dashboard/bookings/[id]/chat`. No inbox.
- **Send window:** messages are **sendable in every booking state except `cancelled`** (`requested` → `completed` all allow sending; `cancelled` is read-only). History is always visible.
- **Badge liveness:** the nav badge is **server-computed on navigation**; the open chat page is fully live via Realtime.
- **Send mechanism:** **direct RLS-guarded insert** from the browser Supabase client (idiomatic Realtime pattern; instant echo), not a server action.

## Existing groundwork

- `chat_threads(id, booking_id UNIQUE, created_at)` and `chat_messages(id, thread_id, sender_id, body CHECK length>0, created_at)` already exist (migration `20260703140003_bookings_chat_reviews.sql`).
- RLS already present (`20260703140004_rls_policies.sql`): participants can **SELECT** threads/messages and **INSERT** messages (`sender_id = auth.uid()` + participant). Gaps: `chat_threads` has **no INSERT policy**; the message INSERT policy does **not** enforce the cancelled-read-only rule; no read-tracking; `chat_messages` is **not** in the `supabase_realtime` publication.
- `is_booking_participant(booking_id)` and `is_admin()` helpers exist and are used by the current chat policies.

## Data model — one new table

```sql
create table public.chat_reads (
  thread_id    uuid not null references public.chat_threads(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);
```

Unread, for a user = messages in their threads where `created_at > coalesce(last_read_at, 'epoch')` **and** `sender_id <> user`.

## Database changes (one new migration + regenerated types)

1. **`chat_reads`** table + RLS: a row is readable/writable only by its owner who is a thread participant —
   `using/with check (user_id = auth.uid() and exists(select 1 from chat_threads t where t.id = thread_id and public.is_booking_participant(t.booking_id)))`. Grant select/insert/update to `authenticated`. Upserted on chat open.
2. **`get_or_create_thread(p_booking_id uuid) returns uuid`** — SECURITY DEFINER, `set search_path = public`. Raises `not_authenticated` / `not_authorized` / `not_found`; validates `is_booking_participant`; inserts the thread if missing (idempotent on `unique(booking_id)`, `on conflict (booking_id) do nothing`); returns the thread id. `grant execute to authenticated`.
3. **Tighten the message INSERT policy** — DROP and recreate "participants send messages in their thread" so `with check` also requires the booking is not cancelled:
   `... and exists (select 1 from chat_threads t join bookings b on b.id = t.booking_id where t.id = thread_id and b.status <> 'cancelled')`. (Server-side enforcement of the read-only rule; the UI also hides the composer.)
4. **`get_unread_count() returns integer`** — SECURITY DEFINER; total unread across the caller's threads (excludes own messages). For the nav badge.
5. **`get_unread_map() returns table(booking_id uuid, unread integer)`** — SECURITY DEFINER; per-booking unread for the caller. **Separate** from `get_my_bookings`/`get_talachero_bookings` so those money-critical RPC return shapes are untouched. Merged into the booking view in the data layer.
6. **Realtime:** `alter publication supabase_realtime add table public.chat_messages;` RLS is still enforced on the `postgres_changes` stream for the authed client.
7. Regenerate `database.types.ts`; add any needed aliases to hand-maintained `types.ts`.

## Components & routes

- **`src/app/[locale]/dashboard/bookings/[id]/chat/page.tsx`** (server): `getAppUser` guard → `get_or_create_thread(id)` (authorizes + ensures thread) → load messages (RLS SELECT, ascending) → resolve the **counterparty name and booking status** from the caller's existing booking projection (`get_my_bookings`/`get_talachero_bookings` already return the other party's name behind `users` RLS — find the row matching this booking id; no new name-exposing query) → `sendable = booking.status !== 'cancelled'` → upsert `chat_reads.last_read_at = now()` (marks read) → render `ChatView`. If the booking id isn't in the caller's projection (non-participant) → `notFound()`.
- **`chat-view.tsx`** (`"use client"`): renders the message list (self right-aligned / counterparty left, by comparing `sender_id` to `currentUserId`), a composer, and — when `!sendable` — a read-only note instead of the composer. Subscribes with the browser Supabase client to `postgres_changes` INSERT on `chat_messages` filtered by `thread_id=eq.<id>`, appending new rows (dedupe by id). **Send** = `supabase.from('chat_messages').insert({ thread_id, sender_id: currentUserId, body })`; on error show an inline message and keep the input text.
- **`BookingCard`**: add a **"Mensajes"** action (with `(n)` when unread > 0) linking to the chat route, on both client and talachero dashboards. `n` comes from `get_unread_map` merged into the booking view.
- **`TopNavBar`**: unread badge on the **"Mi panel"** link (total from `get_unread_count`). Chat is per-booking, so the nav badge routes the user to the dashboard where per-card counts show which booking to open.
- **`src/lib/data/chat.ts`**: data-access layer wrapping the RPCs and mapping snake_case → camelCase, consistent with `lib/data/`.

## Data flow

Open chat → thread ensured + messages loaded + `chat_reads` upserted (that booking's unread clears) → both participants' `ChatView` subscribed to the thread → sender inserts a message (RLS-guarded) → Realtime pushes to both clients (live append) → the recipient's next dashboard/nav render reflects the incremented `get_unread_count` / `get_unread_map`.

## Error handling

- **Send failure** (RLS reject, offline): inline error in the composer; the typed text is preserved.
- **Realtime disconnect:** message history is SSR-loaded on page load regardless; the client subscription auto-reconnects.
- **Cancelled booking:** composer hidden (UI) **and** the tightened INSERT policy blocks new messages (defense in depth).
- **Non-participant / bad id:** RLS yields no thread/messages; the route returns `notFound()`.
- **Empty/whitespace body:** blocked client-side and by the existing `check (length(btrim(body)) > 0)`.

## Verification

No test runner; verification is typecheck + lint + build clean plus a manual two-session run:
1. `pnpm typecheck && pnpm lint && pnpm build` clean; `gen types` applied.
2. Two browsers — Mariana (client) and Carlos (talachero) on a shared booking — exchange messages that appear **live** in both without reload.
3. The recipient's nav badge + the booking card's "Mensajes (n)" increment on their next navigation; opening the chat clears them.
4. A `cancelled` booking shows history but no composer, and a direct insert attempt is rejected by RLS.
5. A signed-in non-participant hitting the chat URL gets `notFound()`.
Use `supabase migration up` (not `db reset`) to preserve Stripe onboarding state.

## Follow-ups (later)

- Phase 5B: email notifications (Resend) — separate spec.
- Optional: live-updating nav badge (global Realtime subscription).
- Optional: a messages inbox if per-booking navigation proves clunky at scale.
