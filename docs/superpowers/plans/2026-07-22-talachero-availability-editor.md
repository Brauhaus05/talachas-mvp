# Talachero Availability Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a signed-in talachero a self-service week-grid editor to open/close their own 1-hour reservable slots.

**Architecture:** Direct management of concrete `availability_slots` rows (Approach A — no recurring templates, no cron, no new tables). Two `SECURITY DEFINER` RPCs handle the CDMX→UTC math + ownership/bounds/booked-guard atomically; a data reader surfaces open+booked slots for the horizon; a client week grid toggles cells optimistically via two thin server actions. Grid = `08:00–20:00` (hours 8…19), 14-day rolling horizon, paged into two weeks, mobile horizontal scroll, all in `America/Mexico_City`.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), React 19, next-intl, Supabase (Postgres RPC + RLS), TypeScript strict, Tailwind v4, pnpm.

**Repo testing reality:** there is **no unit-test runner**. "Test" for each task = `pnpm typecheck` + `pnpm lint` clean (and, for the migration, DB-level SQL via the auth-simulation recipe). Verification and a browser pass live in the final task. Commit after every task.

**Branch:** already on `feat/talachero-availability-editor` (the design spec is committed there).

**Spec:** `docs/superpowers/specs/2026-07-22-talachero-availability-editor-design.md`

---

## File Structure

- **Create** `supabase/migrations/20260722120001_availability_editor.sql` — the two RPCs.
- **Modify** `src/lib/supabase/database.types.ts` — regenerated (do not hand-edit).
- **Modify** `src/lib/data/talacheros.ts` — add `AvailabilitySlotView` + `getMyAvailability()`.
- **Create** `src/app/[locale]/dashboard/talachero/availability/actions.ts` — `openSlot` / `closeSlot`.
- **Create** `src/app/[locale]/dashboard/talachero/availability/availability-grid.tsx` — client week grid.
- **Create** `src/app/[locale]/dashboard/talachero/availability/page.tsx` — route + role guard.
- **Modify** `src/app/[locale]/dashboard/talachero/page.tsx` — replace the schedule placeholder with a link card.
- **Modify** `messages/es.json` + `messages/en.json` — `availability` namespace + one dashboard key.

---

## Task 1: Database — the two availability RPCs

**Files:**
- Create: `supabase/migrations/20260722120001_availability_editor.sql`
- Modify (generated): `src/lib/supabase/database.types.ts`

**Prerequisite:** the local Supabase stack must be running so we can apply the migration and regenerate types. `pnpm exec supabase status` should print the API/DB URLs; if not, `pnpm exec supabase start`. Use `migration up` (never `db reset`) so any Stripe onboarding survives.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260722120001_availability_editor.sql`:

```sql
-- Talachero self-service availability editor (Sprint 2).
-- Approach A: the talachero directly opens/closes concrete 1-hour
-- availability_slots rows. availability_slots already has a permissive owner
-- RLS policy, but every write goes through these SECURITY DEFINER functions so
-- the CDMX->UTC conversion stays in Postgres (like the seed) and ownership +
-- bounds + the booked-guard are validated atomically. The GiST exclusion
-- constraint makes a duplicate/overlapping slot impossible; we treat that as an
-- idempotent no-op rather than an error.

-- open_availability_slot: open a 1-hour slot at a CDMX civil (date, hour).
create or replace function public.open_availability_slot(
  p_date date,
  p_hour int
) returns table(id uuid, start_time timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_talachero_id uuid;
  v_today        date;
  v_start        timestamptz;
  v_end          timestamptz;
  v_id           uuid;
begin
  select tp.id into v_talachero_id
  from public.talachero_profiles tp
  where tp.user_id = auth.uid();
  if v_talachero_id is null then
    raise exception 'not_authorized';
  end if;

  if p_hour < 8 or p_hour > 19 then
    raise exception 'out_of_range';
  end if;

  v_today := (now() at time zone 'America/Mexico_City')::date;
  if p_date < v_today or p_date > v_today + 14 then
    raise exception 'out_of_range';
  end if;

  -- Interpret (date, hour) as a CDMX wall-clock, store the absolute instant.
  v_start := (p_date + make_interval(hours => p_hour)) at time zone 'America/Mexico_City';
  v_end   := v_start + interval '1 hour';

  begin
    insert into public.availability_slots (talachero_id, start_time, end_time, status)
    values (v_talachero_id, v_start, v_end, 'open')
    returning availability_slots.id into v_id;
  exception when exclusion_violation or unique_violation then
    -- A slot (open or booked) already exists at this instant: idempotent open.
    select s.id into v_id
    from public.availability_slots s
    where s.talachero_id = v_talachero_id and s.start_time = v_start;
  end;

  return query
  select s.id, s.start_time
  from public.availability_slots s
  where s.id = v_id;
end;
$$;

-- close_availability_slot: remove an OPEN owned slot. Booked slots are never
-- removed here (the talachero cancels/rejects the booking instead).
create or replace function public.close_availability_slot(p_slot_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_talachero_id uuid;
  v_status       public.slot_status;
begin
  select tp.id into v_talachero_id
  from public.talachero_profiles tp
  where tp.user_id = auth.uid();
  if v_talachero_id is null then
    raise exception 'not_authorized';
  end if;

  select s.status into v_status
  from public.availability_slots s
  where s.id = p_slot_id and s.talachero_id = v_talachero_id;

  if v_status is null then
    raise exception 'not_authorized';  -- not owned / does not exist
  end if;
  if v_status <> 'open' then
    raise exception 'slot_booked';
  end if;

  delete from public.availability_slots
  where id = p_slot_id and talachero_id = v_talachero_id and status = 'open';
end;
$$;

revoke all on function public.open_availability_slot(date, int) from public;
grant execute on function public.open_availability_slot(date, int) to authenticated;
revoke all on function public.close_availability_slot(uuid) from public;
grant execute on function public.close_availability_slot(uuid) to authenticated;
```

- [ ] **Step 2: Apply the migration**

Run: `pnpm exec supabase migration up --local`
Expected: applies `20260722120001_availability_editor.sql` with no error.

- [ ] **Step 3: DB-level verification (auth-simulation recipe, rolled back)**

Get a seeded talachero's user id and run the checks. Connect with:
`psql "postgresql://postgres:postgres@127.0.0.1:55322/postgres"`
(confirm the port with `pnpm exec supabase status` if it differs.)

Run this block and read the NOTICEs:

```sql
begin;
-- Pick a talachero user to impersonate.
select id as talachero_user, (select id from public.talachero_profiles where user_id = u.id) as profile_id
from public.users u where u.role = 'talachero' limit 1 \gset

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', :'talachero_user', 'role', 'authenticated')::text, true);

-- (a) happy path: open tomorrow 10:00 CDMX
select * from public.open_availability_slot((now() at time zone 'America/Mexico_City')::date + 1, 10);
-- expect one row (id, start_time); start_time is 10:00 America/Mexico_City as UTC

-- (b) idempotent: opening the same slot again returns the same row, no dup
select * from public.open_availability_slot((now() at time zone 'America/Mexico_City')::date + 1, 10);

-- (c) out_of_range: bad hour and far date
do $$ begin
  perform public.open_availability_slot((now() at time zone 'America/Mexico_City')::date + 1, 7);
  raise exception 'should have failed';
exception when others then raise notice 'hour 7 -> %', sqlerrm; end $$;
do $$ begin
  perform public.open_availability_slot((now() at time zone 'America/Mexico_City')::date + 30, 10);
  raise exception 'should have failed';
exception when others then raise notice 'date +30 -> %', sqlerrm; end $$;

-- (d) close happy path (uses the slot opened above)
with s as (
  select id from public.availability_slots
  where start_time = (((now() at time zone 'America/Mexico_City')::date + 1) + make_interval(hours => 10)) at time zone 'America/Mexico_City'
  limit 1)
select public.close_availability_slot((select id from s));

-- (e) slot_booked guard: reopen, mark booked (as superuser), then close must fail
reset role;
select public.open_availability_slot((now() at time zone 'America/Mexico_City')::date + 1, 11) \gset open_
update public.availability_slots set status = 'booked' where id = :'open_id';
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', :'talachero_user', 'role', 'authenticated')::text, true);
do $$ declare v uuid; begin
  select id into v from public.availability_slots where status='booked' order by created_at desc limit 1;
  perform public.close_availability_slot(v);
  raise exception 'should have failed';
exception when others then raise notice 'close booked -> %', sqlerrm; end $$;

rollback;
```

Expected NOTICEs: `hour 7 -> out_of_range`, `date +30 -> out_of_range`, `close booked -> slot_booked`. Steps (a)/(b) return the **same** id. `rollback` leaves the DB untouched.

- [ ] **Step 4: Regenerate DB types**

Run: `pnpm exec supabase gen types typescript --local > src/lib/supabase/database.types.ts`
Then confirm the RPC names landed:
Run: `grep -c "open_availability_slot\|close_availability_slot" src/lib/supabase/database.types.ts`
Expected: a non-zero count (both functions appear in the generated `Functions` block). No change to hand-maintained `types.ts` is needed (no new row/enum alias).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: clean (the generated types compile).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260722120001_availability_editor.sql src/lib/supabase/database.types.ts
git commit -m "feat(availability): open/close slot RPCs + regenerated types"
```

---

## Task 2: Data reader — `getMyAvailability()`

**Files:**
- Modify: `src/lib/data/talacheros.ts` (append after `getTalacheroSlots`, near line 144)

- [ ] **Step 1: Add the view type + reader**

Append to `src/lib/data/talacheros.ts`:

```ts
export interface AvailabilitySlotView {
  id: string;
  /** CDMX civil date, YYYY-MM-DD. */
  date: string;
  /** CDMX hour of day, 0–23. */
  hour: number;
  status: "open" | "booked";
}

const AVAIL_TZ = "America/Mexico_City";
const cdmxDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: AVAIL_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const cdmxHourFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: AVAIL_TZ,
  hour: "2-digit",
  hour12: false,
});

/**
 * The signed-in talachero's own slots (open + booked) within the next ~14 days,
 * shaped for the availability grid. `blocked` slots are excluded (unused).
 * Returns [] if the caller isn't a talachero / has no profile.
 */
export async function getMyAvailability(): Promise<AvailabilitySlotView[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from("talachero_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) return [];

  const now = new Date();
  const horizon = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
  const { data, error } = await supabase
    .from("availability_slots")
    .select("id, start_time, status")
    .eq("talachero_id", profile.id)
    .in("status", ["open", "booked"])
    .gte("start_time", now.toISOString())
    .lt("start_time", horizon.toISOString())
    .order("start_time");
  if (error) throw error;

  return (data ?? []).map((s) => {
    const d = new Date(s.start_time);
    return {
      id: s.id,
      date: cdmxDateFmt.format(d), // "2026-07-22"
      hour: Number(cdmxHourFmt.format(d)), // 8..19
      status: s.status as "open" | "booked",
    };
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/talacheros.ts
git commit -m "feat(availability): getMyAvailability reader (open+booked, CDMX date/hour)"
```

---

## Task 3: Server actions — `openSlot` / `closeSlot`

**Files:**
- Create: `src/app/[locale]/dashboard/talachero/availability/actions.ts`

- [ ] **Step 1: Write the actions**

Create the file:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

export type ToggleResult =
  | { ok: true; slotId: string }
  | { ok: false; error: string };

/** Map the RPCs' raised codes to a known, translatable set; anything else
 * collapses to "generic". Mirrors mapProfileError() in the profile action. */
const KNOWN = ["slot_booked", "out_of_range", "not_authorized"];
function mapToggleError(message: string): string {
  const m = message.toLowerCase();
  return KNOWN.find((code) => m.includes(code)) ?? "generic";
}

export async function openSlot(date: string, hour: number): Promise<ToggleResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_availability_slot", {
    p_date: date,
    p_hour: hour,
  });
  if (error) return { ok: false, error: mapToggleError(error.message) };
  const row = (data ?? [])[0] as { id: string } | undefined;
  if (!row) return { ok: false, error: "generic" };
  const locale = await getLocale();
  revalidatePath(`/${locale}/dashboard/talachero/availability`);
  return { ok: true, slotId: row.id };
}

export async function closeSlot(slotId: string): Promise<ToggleResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_availability_slot", {
    p_slot_id: slotId,
  });
  if (error) return { ok: false, error: mapToggleError(error.message) };
  const locale = await getLocale();
  revalidatePath(`/${locale}/dashboard/talachero/availability`);
  return { ok: true, slotId };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean (the RPC names/params come from the Task 1 regenerated types).

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/dashboard/talachero/availability/actions.ts"
git commit -m "feat(availability): openSlot/closeSlot server actions"
```

---

## Task 4: i18n — `availability` namespace + dashboard key

**Files:**
- Modify: `messages/es.json`
- Modify: `messages/en.json`

- [ ] **Step 1: Add the `availability` namespace to `messages/es.json`**

Add this top-level key (Spanish is the default; keep alphabetical-ish placement is not required, but keep valid JSON):

```json
"availability": {
  "title": "Tu disponibilidad",
  "subtitle": "Toca un horario para abrirlo o cerrarlo. Los clientes solo pueden reservar los horarios que abras.",
  "week_1": "Semana 1",
  "week_2": "Semana 2",
  "cell_open": "Disponible a las {hour}:00. Toca para cerrar.",
  "cell_booked": "Reservado a las {hour}:00.",
  "cell_closed": "Cerrado a las {hour}:00. Toca para abrir.",
  "legend": "Marcado = disponible · candado = reservado · vacío = cerrado. Para liberar un horario reservado, cancela la reserva.",
  "error_slot_booked": "Ese horario ya tiene una reserva. Cancélala para liberarlo.",
  "error_out_of_range": "Ese horario está fuera del rango permitido.",
  "error_not_authorized": "No pudimos actualizar ese horario.",
  "error_generic": "No pudimos guardar el cambio. Inténtalo de nuevo."
}
```

Also add one key inside the existing `"dashboard"` object:

```json
"talachero_schedule_cta": "Editar disponibilidad"
```

- [ ] **Step 2: Add the mirrored `availability` namespace to `messages/en.json`**

```json
"availability": {
  "title": "Your availability",
  "subtitle": "Tap a time to open or close it. Clients can only book the times you open.",
  "week_1": "Week 1",
  "week_2": "Week 2",
  "cell_open": "Available at {hour}:00. Tap to close.",
  "cell_booked": "Booked at {hour}:00.",
  "cell_closed": "Closed at {hour}:00. Tap to open.",
  "legend": "Checked = available · lock = booked · empty = closed. To free a booked time, cancel the booking.",
  "error_slot_booked": "That time already has a booking. Cancel it to free the slot.",
  "error_out_of_range": "That time is outside the allowed range.",
  "error_not_authorized": "We couldn't update that time.",
  "error_generic": "We couldn't save the change. Please try again."
}
```

Also add inside the existing `"dashboard"` object:

```json
"talachero_schedule_cta": "Edit availability"
```

- [ ] **Step 3: Verify both locales have the same key set**

Run:
```bash
node -e "const es=require('./messages/es.json'),en=require('./messages/en.json');const ks=o=>Object.keys(o).sort().join(',');console.log('availability parity:', ks(es.availability)===ks(en.availability));console.log('dashboard cta es/en:', 'talachero_schedule_cta' in es.dashboard, 'talachero_schedule_cta' in en.dashboard);"
```
Expected: `availability parity: true` and both dashboard checks `true`.

- [ ] **Step 4: Commit**

```bash
git add messages/es.json messages/en.json
git commit -m "i18n(availability): add availability namespace + schedule CTA (es/en)"
```

---

## Task 5: Client component — `AvailabilityGrid`

**Files:**
- Create: `src/app/[locale]/dashboard/talachero/availability/availability-grid.tsx`

- [ ] **Step 1: Write the grid**

Create the file:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Lock, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AvailabilitySlotView } from "@/lib/data/talacheros";
import { openSlot, closeSlot } from "./actions";

const TZ = "America/Mexico_City";
const HOURS = Array.from({ length: 12 }, (_, i) => 8 + i); // 8..19
const HORIZON_DAYS = 14;

type CellState =
  | { kind: "empty" }
  | { kind: "open"; slotId: string }
  | { kind: "booked" };

function keyOf(date: string, hour: number) {
  return `${date}|${hour}`;
}

export function AvailabilityGrid({ initial }: { initial: AvailabilitySlotView[] }) {
  const t = useTranslations("availability");
  const locale = useLocale();

  // Current CDMX civil date + hour (to disable past cells).
  const nowParts = useMemo(() => {
    const d = new Date();
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(d)
    );
    return { date, hour };
  }, []);

  // 14 civil dates from today. Anchor at noon UTC so adding whole days never
  // rolls the calendar date (Mexico has no DST regardless).
  const dates = useMemo(() => {
    const [y, m, d] = nowParts.date.split("-").map(Number);
    const anchor = Date.UTC(y, m - 1, d, 12);
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return Array.from({ length: HORIZON_DAYS }, (_, i) =>
      fmt.format(new Date(anchor + i * 86400000))
    );
  }, [nowParts.date]);

  const labelFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        timeZone: "UTC",
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
    [locale]
  );

  const [cells, setCells] = useState<Map<string, CellState>>(() => {
    const map = new Map<string, CellState>();
    for (const s of initial) {
      map.set(
        keyOf(s.date, s.hour),
        s.status === "booked" ? { kind: "booked" } : { kind: "open", slotId: s.id }
      );
    }
    return map;
  });

  const [week, setWeek] = useState(0); // 0 or 1
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const visibleDates = dates.slice(week * 7, week * 7 + 7);

  function isPast(date: string, hour: number) {
    return date < nowParts.date || (date === nowParts.date && hour <= nowParts.hour);
  }

  function toggle(date: string, hour: number) {
    const k = keyOf(date, hour);
    const cur = cells.get(k) ?? { kind: "empty" };
    if (cur.kind === "booked" || isPast(date, hour)) return;
    // Ignore clicks while an open is still in flight (no real slotId yet), so a
    // fast double-click can never send the "pending" sentinel to closeSlot.
    if (cur.kind === "open" && cur.slotId === "pending") return;
    setError(null);

    if (cur.kind === "empty") {
      setCells((prev) => new Map(prev).set(k, { kind: "open", slotId: "pending" }));
      startTransition(async () => {
        const res = await openSlot(date, hour);
        if (res.ok) {
          setCells((prev) => new Map(prev).set(k, { kind: "open", slotId: res.slotId }));
        } else {
          setCells((prev) => new Map(prev).set(k, { kind: "empty" }));
          setError(res.error);
        }
      });
    } else {
      const slotId = cur.slotId;
      setCells((prev) => new Map(prev).set(k, { kind: "empty" }));
      startTransition(async () => {
        const res = await closeSlot(slotId);
        if (!res.ok) {
          setCells((prev) =>
            new Map(prev).set(
              k,
              res.error === "slot_booked" ? { kind: "booked" } : { kind: "open", slotId }
            )
          );
          setError(res.error);
        }
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {[0, 1].map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setWeek(w)}
            aria-pressed={week === w}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
              week === w
                ? "border-border-strong bg-surface-muted text-text-primary"
                : "border-border text-text-secondary hover:bg-surface-muted"
            )}
          >
            {t(w === 0 ? "week_1" : "week_2")}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-text-primary text-sm">
          {t(`error_${error}`)}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-10" />
              {visibleDates.map((d) => (
                <th
                  key={d}
                  className="text-text-secondary min-w-[64px] text-xs font-medium capitalize"
                >
                  {labelFmt.format(new Date(`${d}T12:00:00Z`))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map((h) => (
              <tr key={h}>
                <td className="text-text-muted pr-1 text-right align-middle text-xs">
                  {String(h).padStart(2, "0")}h
                </td>
                {visibleDates.map((d) => {
                  const cur = cells.get(keyOf(d, h)) ?? { kind: "empty" };
                  const past = isPast(d, h);
                  const booked = cur.kind === "booked";
                  const open = cur.kind === "open";
                  return (
                    <td key={d}>
                      <button
                        type="button"
                        onClick={() => toggle(d, h)}
                        disabled={booked || past}
                        aria-pressed={open}
                        aria-label={t(
                          open ? "cell_open" : booked ? "cell_booked" : "cell_closed",
                          { hour: h }
                        )}
                        className={cn(
                          "flex h-9 w-full min-w-[64px] items-center justify-center rounded-md border text-xs transition-colors",
                          past && "border-border bg-background opacity-40",
                          !past &&
                            booked &&
                            "border-border-strong bg-surface-muted text-text-muted cursor-not-allowed",
                          !past &&
                            open &&
                            "border-border-strong bg-action-primary text-text-inverse",
                          !past &&
                            !open &&
                            !booked &&
                            "border-border bg-background text-text-secondary hover:bg-surface-muted"
                        )}
                      >
                        {booked ? (
                          <Lock className="h-3.5 w-3.5" aria-hidden />
                        ) : open ? (
                          <Check className="h-3.5 w-3.5" aria-hidden />
                        ) : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-text-muted text-xs">{t("legend")}</p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean. (If lint flags formatting, run `pnpm exec prettier --write` on **this file only** — per the prettier-drift gotcha, don't reformat others.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/dashboard/talachero/availability/availability-grid.tsx"
git commit -m "feat(availability): week-grid client component with optimistic toggles"
```

---

## Task 6: Route page + role guard

**Files:**
- Create: `src/app/[locale]/dashboard/talachero/availability/page.tsx`

- [ ] **Step 1: Write the page**

Create the file (mirrors `talachero/profile/page.tsx`):

```tsx
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { getAppUser, dashboardPathForRole } from "@/lib/auth";
import { getMyAvailability } from "@/lib/data/talacheros";
import { AvailabilityGrid } from "./availability-grid";

export default async function TalacheroAvailabilityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await getAppUser();
  if (!user) {
    redirect(`/${locale}/auth/sign-in` as Route);
  }
  if (user.role !== "talachero") {
    redirect(`/${locale}${dashboardPathForRole(user.role)}` as Route);
  }

  const t = await getTranslations("availability");
  const initial = await getMyAvailability();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-text-primary text-2xl font-semibold">{t("title")}</h1>
        <p className="text-text-secondary mt-1 text-sm">{t("subtitle")}</p>
      </div>
      <AvailabilityGrid initial={initial} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/dashboard/talachero/availability/page.tsx"
git commit -m "feat(availability): talachero availability route + role guard"
```

---

## Task 7: Dashboard wire-up — schedule placeholder → link card

**Files:**
- Modify: `src/app/[locale]/dashboard/talachero/page.tsx`

- [ ] **Step 1: Replace the schedule `PlaceholderPanel` with a link Card**

In `src/app/[locale]/dashboard/talachero/page.tsx`, find the block (around lines 157–161):

```tsx
        <PlaceholderPanel
          title={t("talachero_schedule")}
          description={t("talachero_schedule_desc")}
          comingSoon={t("coming_soon")}
        />
```

Replace it with:

```tsx
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("talachero_schedule")}</CardTitle>
            <CardDescription>{t("talachero_schedule_desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/dashboard/talachero/availability"
              className={buttonVariants({ size: "sm" })}
            >
              {t("talachero_schedule_cta")}
            </Link>
          </CardContent>
        </Card>
```

- [ ] **Step 2: Remove the now-unused `PlaceholderPanel` import**

`PlaceholderPanel` was only used for the schedule panel. Delete its import line (line 8):

```tsx
import { PlaceholderPanel } from "../dashboard-ui";
```

(`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `Link`, and `buttonVariants` are already imported at the top of this file — no new imports needed.)

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean, and lint confirms no unused `PlaceholderPanel` import remains.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/dashboard/talachero/page.tsx"
git commit -m "feat(availability): link the talachero dashboard to the availability editor"
```

---

## Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full static verification**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: all clean. Confirm `/[locale]/dashboard/talachero/availability` appears in the build route list.

- [ ] **Step 2: Browser pass (dev server + a seeded talachero)**

Prereqs: local Supabase stack running; if the seed talacheros aren't Stripe-onboarded that's fine — availability editing doesn't need Stripe. Start `pnpm dev`.

1. Sign in as a seeded talachero (e.g. `carlos.mendoza@demo.talachas.mx` / `password123`).
2. Talachero dashboard → the **"Tu agenda"** card now shows **"Editar disponibilidad"** → click it.
3. On `/dashboard/talachero/availability`:
   - Toggle several cells **on** (check appears immediately) across **both** week pages (‹ Semana 1 / Semana 2 ›).
   - Toggle some **off** (check clears).
   - Confirm any **booked** cell renders locked (🔒) and isn't clickable; confirm **past** hours today are dimmed/disabled.
   - **Reload** — the open/booked state persists (server truth via `getMyAvailability`).
   - Narrow the viewport (or DevTools mobile) — the grid **scrolls horizontally**, no layout break.
   - Console: **zero errors**.
4. Cross-check the client side: open an incognito window, sign in as `mariana.ruiz@demo.talachas.mx` / `password123`, open that talachero's `/book/[talacheroId]` — a slot you just opened appears in the picker; one you closed does not.

- [ ] **Step 3: Update HANDOFF + Notion (owner-facing)**

- Add a short "Availability editor (Sprint 2)" section to `HANDOFF.md` (what shipped, verification state, migration `20260722120001`).
- Commit: `docs: HANDOFF — availability editor (Sprint 2)`.
- (The Notion "Editor de disponibilidad" task → move to **En revisión**/**Hecho** as agreed with the owner.)

- [ ] **Step 4: Open the PR**

```bash
git push -u origin feat/talachero-availability-editor
gh pr create --base main --title "Talachero availability editor (Sprint 2)" \
  --body "Self-service week-grid availability editor: open/close 1-hour slots (08:00–20:00, 14-day horizon), CDMX time, booked slots locked. Two SECURITY DEFINER RPCs (open/close), getMyAvailability reader, optimistic client grid, dashboard link. Spec + plan in docs/superpowers/. Verified: typecheck/lint/build + DB-level RPC checks + browser pass.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Self-review notes (author)

- **Spec coverage:** RPCs (Task 1) ✓ · reader (Task 2) ✓ · actions (Task 3) ✓ · i18n (Task 4) ✓ · grid week-layout + optimistic + booked/past states + mobile scroll (Task 5) ✓ · route + role guard (Task 6) ✓ · dashboard card (Task 7) ✓ · verification incl. DB-level + client cross-check (Tasks 1, 8) ✓. Non-goals (templates/cron/whole-day block/bookable-gate) intentionally excluded.
- **Type consistency:** `AvailabilitySlotView { id, date, hour, status }` defined in Task 2, consumed unchanged in Tasks 3/5/6. `ToggleResult` defined in Task 3, consumed in Task 5. RPC names/params (`open_availability_slot(p_date,p_hour)`, `close_availability_slot(p_slot_id)`) consistent across Tasks 1/3. `slotId: "pending"` sentinel is guarded in `toggle` (clicks on a still-pending open cell are ignored), so it's never sent to `closeSlot`; it's overwritten with the real id on success or reverted to empty on failure.
- **No placeholders:** every code step shows complete code; every run step shows the command + expected result.
