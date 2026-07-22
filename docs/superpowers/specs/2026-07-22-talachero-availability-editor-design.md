# Talachero Availability Editor — Design

**Date:** 2026-07-22
**Status:** Approved (brainstorming) — ready for implementation plan
**Sprint task:** Sprint 2 · Autoservicio de prestadores — "Editor de disponibilidad (horarios semanales y excepciones)"

## Summary

Give a signed-in talachero a self-service editor to define their own **reservable
slots**. Without it a talachero can't make themselves bookable — the 10 demo
talacheros were seeded manually, so this is a launch blocker.

**Authoring model — Approach A "direct slot calendar" (chosen).** The talachero
directly opens/closes concrete 1-hour `availability_slots` rows on a week grid.
**No recurring templates, no cron, no new tables.** The grid spans `08:00–20:00`
(12 one-hour start slots, `08`…`19`) over a **14-day rolling horizon**, laid out as
a **week grid** (columns = days, rows = hours), paged into two weeks. All times are
authored and displayed in `America/Mexico_City`.

**Deferred (own follow-up tasks, not this build):**
- Recurring weekly templates ("set once") and per-day copy/paste.
- One-tap "block a whole day / vacation range".
- The "minimum fields before bookable" gate (pairs with the onboarding flow).

## Context / constraints discovered

- **`availability_slots`** = flat list of concrete rows
  (`id, talachero_id, start_time, end_time, status`), `slot_status` enum
  `open | booked | blocked`. A **GiST exclusion constraint** makes two overlapping
  slots for one talachero impossible at the DB level — so a duplicate insert fails
  atomically (we treat that as idempotent, not an error).
- Slots reference `talachero_profiles.id` (not `user_id`). The signed-in user →
  profile resolution is the same one the profile editor uses.
- **Anti-double-booking lock (must preserve):** `create_booking` does
  `SELECT … FOR UPDATE` on the slot row and flips it to `booked` **inside its
  transaction, before** opening Stripe Checkout. So an `open` slot never has a
  pending reservation — closing an `open` slot is always safe; only `booked` slots
  carry a live booking.
- **RLS already permits owner slot management:** `availability_slots` has a
  permissive `for all` policy (`owns_talachero(talachero_id) or is_admin()`) — the
  one mutable table deliberately designed for owner writes. We still route writes
  through RPCs (below) for tz-correctness + atomic validation; the RLS policy stays
  as-is.
- **Timezone convention:** the app stores UTC `timestamptz` and **displays** via
  `Intl.DateTimeFormat(locale, { timeZone: "America/Mexico_City" })`
  (`booking-form.tsx`, `booking-card.tsx`, `summary/page.tsx` all define
  `const TZ = "America/Mexico_City"`). There is **no** JS helper for the reverse
  (CDMX wall-clock → UTC instant); the seed does that conversion in Postgres
  (`… at time zone 'America/Mexico_City'`). We follow the seed and keep the
  conversion in Postgres. (Mexico no longer observes DST, but keeping the math in
  Postgres stays correct regardless.)
- Existing reader `getTalacheroSlots(talacheroId)` returns only **open, future**
  slots for the *public* booking picker — not reusable for the editor, which also
  needs `booked` slots to render locked cells.
- Form/action convention: `useActionState` + server action, DB error codes mapped to
  `error_*` i18n keys; grayscale banners; shared `Button`. Dedicated route + role
  guard mirrors `/dashboard/talachero/profile` (shipped in PR #18).

## Architecture (5 layers)

### 1. Database — new migration `20260722120001_availability_editor.sql`

Two `SECURITY DEFINER` RPCs (consistent with every other write in this codebase
going through a function; keeps CDMX→UTC math + validation atomic and server-side):

**`open_availability_slot(p_date date, p_hour int) returns table(id uuid, start_time timestamptz)`**
- Resolve caller's `talachero_profiles.id` via `user_id = auth.uid()`; none →
  raise `not_authorized`.
- Validate `p_hour between 8 and 19` → else `out_of_range`.
- Validate `p_date between current_date and current_date + 14` (evaluated at CDMX
  civil date) → else `out_of_range`.
- Compute
  `v_start := (p_date + make_interval(hours => p_hour)) at time zone 'America/Mexico_City'`,
  `v_end := v_start + interval '1 hour'`.
- `insert … (status 'open')`. On the exclusion-constraint / unique violation
  (slot already exists or is booked at that hour) → **swallow and return the
  existing row** (idempotent open). Otherwise return the new row.
- Never sets `blocked`; never touches booked slots.

**`close_availability_slot(p_slot_id uuid) returns void`**
- Delete the slot **only if** it belongs to the caller's profile **and**
  `status = 'open'`.
- If the row exists but is `booked` → raise `slot_booked` (to free it the talachero
  cancels/rejects the booking through the existing flow — a slot is never yanked out
  from under a client).
- If no such owned row → raise `not_authorized` (defensive; UI shouldn't allow it).

Grants: `grant execute … to authenticated`. Repo conventions: `DROP` then `CREATE`
if return columns ever change; run `supabase gen types` after and add any alias to
hand-maintained `types.ts`.

### 2. Data layer — `src/lib/data/talacheros.ts`

Add `getMyAvailability(): Promise<AvailabilitySlotView[]>`:
- Resolve the caller's `talachero_profiles.id` (same helper the profile editor uses).
- Select `id, start_time, end_time, status` where
  `talachero_id = <mine>` and `start_time` within `[now, +14 days]`, ordered by
  `start_time`. Include **both** `open` and `booked` (exclude `blocked`, unused).
- Return a **flat list** the grid groups by (date, hour):
  `AvailabilitySlotView = { id: string; date: string /* YYYY-MM-DD CDMX */;
  hour: number; status: "open" | "booked" }`. The CDMX `date`/`hour` are derived
  with `Intl.DateTimeFormat(..., { timeZone: TZ })` so the grid can map a cell to a
  slot without re-parsing.

### 3. Server actions — `src/app/[locale]/dashboard/talachero/availability/actions.ts`

Two thin actions (not `useActionState` — these are per-cell toggles, invoked
imperatively from the client with optimistic UI):
- `openSlot(date: string, hour: number): Promise<ToggleResult>` → calls
  `open_availability_slot`; returns `{ ok: true, slotId }` or
  `{ ok: false, error }` (coded).
- `closeSlot(slotId: string): Promise<ToggleResult>` → calls
  `close_availability_slot`; maps `slot_booked` → a translatable code.
- Both `revalidatePath("/dashboard/talachero/availability")` on success so a hard
  reload matches. `ToggleResult` error codes are allowlisted to the translatable set
  (`slot_booked`, `out_of_range`, `error_generic`).

### 4. UI — dedicated route

`src/app/[locale]/dashboard/talachero/availability/page.tsx` (server component):
- Role guard (redirect non-talacheros), load `getMyAvailability()`, render
  `<AvailabilityGrid initial={…} />`.

`src/app/[locale]/dashboard/talachero/availability/availability-grid.tsx` (client):
- Builds the 14-day horizon client-side from "today" in CDMX; two week pages
  (‹ Semana 1 / Semana 2 ›).
- **Grid:** columns = the 7 days of the visible week, rows = hours `08…19`. Each
  cell is one of: **open** (toggled on, shows a check, has a `slotId`), **booked**
  (locked 🔒, not interactive), **empty** (off), **past** (hours earlier than now
  today — disabled). Mobile: the grid **scrolls horizontally** (per owner: mobile
  users can scroll) — no separate mobile layout.
- **Optimistic toggle:** clicking an empty cell flips it on immediately and calls
  `openSlot`; clicking an open cell flips it off and calls `closeSlot`. On a failed
  result, **revert** the cell and surface the coded message (grayscale inline
  notice). Local slot-id map updated from `openSlot`'s returned `slotId`.
- Booked cells never toggle; a tooltip/label explains they're reserved.

### 5. Wire-up

- Talachero dashboard (`dashboard/talachero/page.tsx`): add an **"Editar
  disponibilidad"** link card next to the existing "Editar perfil" card.
- New `availability` namespace in `messages/es.json` + `messages/en.json` (in sync,
  Spanish default): page title/intro, week-pager labels, cell state labels
  ("Disponible" / "Reservado"), the toggle error codes, empty-state copy. Weekday +
  hour labels come from `Intl` (localized), not hardcoded strings.

## Validation rules

Enforced in the RPCs (source of truth), mirrored in the grid for immediate feedback:

| Rule | Where | Error code |
|---|---|---|
| `hour` in `08…19` | `open_availability_slot` | `out_of_range` |
| `date` in `[today, today+14]` (CDMX) | `open_availability_slot` | `out_of_range` |
| duplicate/overlap open | GiST constraint | *(idempotent — no error)* |
| close a `booked` slot | `close_availability_slot` | `slot_booked` |
| act on a slot you don't own / no profile | both | `not_authorized` |

## Error handling

- Actions never throw out to the client; they return a typed `ToggleResult`.
- Each toggle is a single atomic RPC (one insert or one conditional delete) — no
  multi-row transaction to partially fail.
- Optimistic UI reverts on any `ok: false`, so the grid always converges to DB truth
  (and a reload re-reads via `getMyAvailability`).

## Notes / non-goals

- Opening/closing slots affects **future** availability only; existing bookings
  snapshot their slot + price at creation, so no backfill.
- The `blocked` slot status stays unused by this feature (presence/absence models
  availability; booked is the only lock).
- No new npm dependencies. No cron. No new tables.
- Horizon extension is implicit: the grid always renders `[today, +14d]` from the
  current day, so it rolls forward naturally each day with no scheduler.

## Testing / verification

No test runner in this repo. Verification = **typecheck + lint + secretless build
clean**, then:

1. **DB-level (auth-simulation recipe, rolled back):**
   `set local role authenticated; select set_config('request.jwt.claims', …)` then
   call the RPCs as a seeded talachero —
   - `open_availability_slot` happy path inserts one `open` row at the right UTC
     instant for a CDMX hour; re-calling the same (date,hour) is idempotent (returns
     the same row, no duplicate).
   - `out_of_range` for hour `7`/`20` and a date `> today+14`.
   - `close_availability_slot` deletes an `open` row; raises `slot_booked` on a
     booked row (mark one `booked` to test); `not_authorized` when called by a
     non-owner.
2. **Cross-check the client picker:** a slot opened here appears in
   `getTalacheroSlots` / the public `/book/[talacheroId]` picker.
3. **Browser pass:** sign in as a seeded talachero → `/dashboard/talachero/availability`
   → toggle several cells on/off across both week pages, confirm a booked cell is
   locked, confirm past hours today are disabled, reload and confirm persistence,
   verify horizontal scroll on a narrow viewport, zero console errors.

Use `supabase migration up` (not `db reset`) so existing Stripe onboarding state
survives, per the project note on `db reset` wiping onboarding.
