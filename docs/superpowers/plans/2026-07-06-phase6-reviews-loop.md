# Phase 6 (cycle 1) — Reviews Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a client leave a 1–5 star + optional comment review on a completed booking, auto-roll it into the talachero's directory rating, prompt for it in the dashboard, and email the talachero.

**Architecture:** A `create_review` SECURITY DEFINER RPC (validates client + completed + no-dupe) writes the review; an AFTER INSERT/DELETE trigger on `reviews` recomputes `rating_avg`/`rating_count` on `talachero_profiles` from real rows; `get_my_bookings` gains a `has_review` flag driving a dashboard prompt → a `/dashboard/bookings/[id]/review` form page → a server action → best-effort new-review email (reusing the 5B notifications module). Client→talachero direction only (bidirectional deferred).

**Tech Stack:** Supabase Postgres (plpgsql SECURITY DEFINER RPCs + triggers, RLS), Next.js 16 App Router (Server Components + Server Actions, `useActionState`), next-intl, TypeScript strict, Resend (existing `src/lib/notifications/`).

> **Testing note:** this repo has **no unit-test runner** (per CLAUDE.md — "verification means typecheck + lint + build clean, plus manually exercising flows"). So each task's "test" is a **DB-level psql assertion** and/or `pnpm typecheck` / `pnpm lint` / `pnpm build`, then a commit. Auth-dependent RPCs are exercised in psql by setting the PostgREST auth GUCs inside a transaction (shown in Task 2). Migrations are applied **non-destructively** with `pnpm exec supabase migration up --local` — **never `db reset`** until Task 9 (a reset wipes Carlos's Stripe onboarding).

---

## File structure

**New migrations** (`supabase/migrations/`):
- `20260706120001_reviews_rating_rollup.sql` — trigger fn + AFTER INSERT/DELETE trigger on `reviews`.
- `20260706120002_create_review.sql` — `create_review(uuid, int, text)` SECURITY DEFINER RPC.
- `20260706120003_get_my_bookings_has_review.sql` — DROP + CREATE `get_my_bookings` with a `has_review` column.

**New app files:**
- `src/app/[locale]/dashboard/bookings/[id]/review/page.tsx` — review form page (authorizes, 404s if not reviewable).
- `src/app/[locale]/dashboard/bookings/[id]/review/review-form.tsx` — `"use client"` form (star input + comment, `useActionState`).
- `src/app/[locale]/dashboard/bookings/[id]/review/actions.ts` — `submitReview` server action.
- `src/components/ui/rating-input.tsx` — `"use client"` interactive 1–5 star selector.

**Modified files:**
- `src/lib/data/bookings.ts` — add `hasReview` to `ClientBooking` + mapper.
- `src/lib/notifications/templates.ts` — add `newReviewEmail`.
- `src/lib/notifications/notify.ts` — add `notifyNewReview`.
- `messages/es.json` + `messages/en.json` — `emails.new_review.*`, `reviews.*`, `dashboard.review_cta`/`dashboard.reviewed`.
- `src/app/[locale]/dashboard/page.tsx` — completed-card branch: review CTA / "reviewed" indicator.
- `src/lib/supabase/database.types.ts` — regenerated after migrations.
- `supabase/seed.sql` — stop hand-setting `rating_avg`/`rating_count` (let the trigger derive).

---

## Task 1: Rating rollup trigger

**Files:**
- Create: `supabase/migrations/20260706120001_reviews_rating_rollup.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Phase 6 · Reviews rating rollup.
-- rating_avg / rating_count on talachero_profiles are derived from real review
-- rows (previously hand-set in the seed, decoupled from reviews). This trigger
-- recomputes them for the affected target on every review INSERT/DELETE, so the
-- directory rating always matches the underlying reviews. Fires on DELETE too,
-- so the Phase 6 admin "delete review" action (cycle 2) fixes the rollup for free.
-- SECURITY DEFINER: writes talachero_profiles money-adjacent aggregate columns.

create or replace function public.recompute_talachero_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target uuid := coalesce(new.target_id, old.target_id);
begin
  update talachero_profiles p
  set
    rating_avg   = coalesce((select round(avg(r.rating)::numeric, 2)
                             from reviews r where r.target_id = v_target), 0),
    rating_count = (select count(*) from reviews r where r.target_id = v_target)
  where p.user_id = v_target;
  return null; -- AFTER trigger: return value ignored
end;
$$;

drop trigger if exists reviews_rating_rollup on public.reviews;
create trigger reviews_rating_rollup
  after insert or delete on public.reviews
  for each row execute function public.recompute_talachero_rating();
```

- [ ] **Step 2: Apply the migration (non-destructive)**

Run: `pnpm exec supabase migration up --local`
Expected: applies `20260706120001_reviews_rating_rollup` with no error.

- [ ] **Step 3: Verify the rollup tracks inserts and deletes**

Run (psql via the local db container):
```bash
docker exec supabase_db_talachas-mvp psql -U postgres -d postgres -c "
do \$\$
declare
  v_tal uuid := (select user_id from talachero_profiles order by user_id limit 1);
  v_book uuid := (select id from bookings limit 1);
  v_client uuid := (select id from users where role='client' limit 1);
  v_rid uuid;
begin
  insert into reviews (booking_id, author_id, target_id, rating, comment)
  values (v_book, v_client, v_tal, 4, 'rollup test') returning id into v_rid;
  raise notice 'after insert: avg=% count=%',
    (select rating_avg from talachero_profiles where user_id=v_tal),
    (select rating_count from talachero_profiles where user_id=v_tal);
  delete from reviews where id = v_rid;
  raise notice 'after delete: avg=% count=%',
    (select rating_avg from talachero_profiles where user_id=v_tal),
    (select rating_count from talachero_profiles where user_id=v_tal);
end \$\$;"
```
Expected: two `NOTICE` lines; the count/avg **change** on insert and revert on delete (values reflect real rows, not the seed constants). No error.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260706120001_reviews_rating_rollup.sql
git commit -m "feat(reviews): AFTER INSERT/DELETE rating rollup trigger"
```

---

## Task 2: `create_review` RPC

**Files:**
- Create: `supabase/migrations/20260706120002_create_review.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Phase 6 · create_review — client leaves a review on a completed booking.
-- SECURITY DEFINER (validates auth.uid() internally), mirroring the other
-- booking write RPCs. Client→talachero direction only; target derived from the
-- booking's talachero profile. One review per (booking, author) enforced by the
-- reviews_one_per_author unique constraint → typed 'already_reviewed'.

create or replace function public.create_review(
  p_booking_id uuid,
  p_rating     integer,
  p_comment    text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_client  uuid;
  v_status  public.booking_status;
  v_tal_id  uuid;
  v_target  uuid;
  v_review  uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_rating';
  end if;

  select client_id, status, talachero_id
    into v_client, v_status, v_tal_id
    from bookings
    where id = p_booking_id;

  if not found then
    raise exception 'booking_not_found';
  end if;
  if v_client <> v_uid then
    raise exception 'not_your_booking';
  end if;
  if v_status <> 'completed' then
    raise exception 'booking_not_completed';
  end if;

  select user_id into v_target from talachero_profiles where id = v_tal_id;

  begin
    insert into reviews (booking_id, author_id, target_id, rating, comment)
    values (p_booking_id, v_uid, v_target, p_rating, nullif(trim(p_comment), ''))
    returning id into v_review;
  exception when unique_violation then
    raise exception 'already_reviewed';
  end;

  return v_review;
end;
$$;

grant execute on function public.create_review(uuid, integer, text) to authenticated;
```

- [ ] **Step 2: Apply the migration**

Run: `pnpm exec supabase migration up --local`
Expected: applies `20260706120002_create_review` with no error.

- [ ] **Step 3: Verify happy path + duplicate rejection under a real auth context**

Run (sets the PostgREST auth GUC so `auth.uid()` resolves to the booking's client, inside a rolled-back transaction so it leaves no data):
```bash
docker exec supabase_db_talachas-mvp psql -U postgres -d postgres -c "
do \$\$
declare
  v_book uuid; v_client uuid; v_rid uuid;
begin
  select id, client_id into v_book, v_client
    from bookings where status='completed' limit 1;
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_client::text)::text, true);
  v_rid := create_review(v_book, 5, '  great work  ');
  raise notice 'created review %, comment=%', v_rid,
    (select comment from reviews where id=v_rid);
  begin
    perform create_review(v_book, 3, 'dup');
    raise notice 'ERROR: duplicate was allowed';
  exception when others then
    raise notice 'duplicate correctly rejected: %', sqlerrm;
  end;
  raise exception 'rollback_test'; -- undo everything
end \$\$;" 2>&1 | grep NOTICE
```
Expected NOTICEs: `created review <uuid>, comment=great work` (trimmed), then `duplicate correctly rejected: already_reviewed`.

- [ ] **Step 4: Verify guard rails (wrong user / not completed)**

Run:
```bash
docker exec supabase_db_talachas-mvp psql -U postgres -d postgres -c "
do \$\$
declare v_book uuid; v_other uuid;
begin
  select id into v_book from bookings where status='completed' limit 1;
  select id into v_other from users where role='talachero' limit 1;
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_other::text)::text, true);
  begin perform create_review(v_book, 5, 'x');
  exception when others then raise notice 'non-client rejected: %', sqlerrm; end;
end \$\$;" 2>&1 | grep NOTICE
```
Expected: `non-client rejected: not_your_booking`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260706120002_create_review.sql
git commit -m "feat(reviews): create_review SECURITY DEFINER RPC with typed errors"
```

---

## Task 3: `has_review` on `get_my_bookings`

**Files:**
- Create: `supabase/migrations/20260706120003_get_my_bookings_has_review.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerated)

- [ ] **Step 1: Write the migration (DROP + CREATE — return columns change)**

```sql
-- Phase 6 · get_my_bookings gains has_review so the client dashboard can show a
-- "leave a review" prompt on completed bookings without a second query.
-- CREATE OR REPLACE can't alter OUT columns → DROP then CREATE.

drop function if exists public.get_my_bookings();

create function public.get_my_bookings()
returns table (
  id             uuid,
  status         public.booking_status,
  payment_status text,
  price          numeric,
  currency       text,
  address        text,
  created_at     timestamptz,
  talachero_id   uuid,
  talachero_name text,
  service_slug   text,
  slot_start     timestamptz,
  has_review     boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id, b.status, b.payment_status, b.price, b.currency, b.address,
    b.created_at, tp.id, tu.full_name, sc.slug, s.start_time,
    exists (select 1 from reviews r
            where r.booking_id = b.id and r.author_id = auth.uid()) as has_review
  from bookings b
  join talachero_profiles tp on tp.id = b.talachero_id
  join users tu on tu.id = tp.user_id
  join service_categories sc on sc.id = b.service_category_id
  left join availability_slots s on s.id = b.slot_id
  where b.client_id = auth.uid()
  order by b.created_at desc;
$$;
```

- [ ] **Step 2: Apply the migration**

Run: `pnpm exec supabase migration up --local`
Expected: applies `20260706120003_get_my_bookings_has_review` with no error.

- [ ] **Step 3: Verify the new column resolves**

Run:
```bash
docker exec supabase_db_talachas-mvp psql -U postgres -d postgres -c "
do \$\$
declare v_client uuid;
begin
  select client_id into v_client from bookings limit 1;
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_client::text)::text, true);
  raise notice 'rows=% with has_review col present',
    (select count(*) from get_my_bookings());
end \$\$;" 2>&1 | grep NOTICE
```
Expected: a `rows=N` notice with no "column has_review does not exist" error.

- [ ] **Step 4: Regenerate DB types**

Run: `pnpm exec supabase gen types typescript --local > src/lib/supabase/database.types.ts`
Expected: file updated; `get_my_bookings` Returns row now includes `has_review: boolean`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260706120003_get_my_bookings_has_review.sql src/lib/supabase/database.types.ts
git commit -m "feat(reviews): add has_review to get_my_bookings"
```

---

## Task 4: Surface `hasReview` in the data layer

**Files:**
- Modify: `src/lib/data/bookings.ts:5-17` (`ClientBooking`) and `:37-49` (mapper)

- [ ] **Step 1: Add the field to the type**

In `ClientBooking`, add after `slotStart`:
```ts
  slotStart: string | null;
  hasReview: boolean;
```

- [ ] **Step 2: Add it to the mapper**

In `getMyBookings()`'s `.map(...)`, add after `slotStart`:
```ts
    slotStart: r.slot_start,
    hasReview: r.has_review,
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: clean (no error; `r.has_review` is now in the generated Returns type from Task 3).

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/bookings.ts
git commit -m "feat(reviews): expose hasReview on ClientBooking"
```

---

## Task 5: New-review email (template + notify + i18n)

**Files:**
- Modify: `messages/es.json`, `messages/en.json` (add `emails.new_review`)
- Modify: `src/lib/notifications/templates.ts` (add `newReviewEmail`)
- Modify: `src/lib/notifications/notify.ts` (add `notifyNewReview`)

- [ ] **Step 1: Add email copy to `messages/es.json`**

Inside the `"emails"` object, after the `"refund"` block, add:
```json
    "new_review": {
      "subject": "Recibiste una nueva reseña",
      "heading": "Nueva reseña",
      "intro": "{client} dejó una reseña de tu servicio en Talachas.",
      "rating_label": "Calificación"
    }
```

- [ ] **Step 2: Add the same keys to `messages/en.json`**

Inside the `"emails"` object, after the `"refund"` block, add:
```json
    "new_review": {
      "subject": "You received a new review",
      "heading": "New review",
      "intro": "{client} left a review of your service on Talachas.",
      "rating_label": "Rating"
    }
```

- [ ] **Step 3: Add the template**

Append to `src/lib/notifications/templates.ts` (uses the existing `makeT`, `layout`, `paragraph`, `row` helpers already in the file):
```ts
/** → talachero, when a client leaves a review. Does not quote the comment body
 * (unmoderated user text stays in-app); shows the numeric rating only. */
export function newReviewEmail(
  locale: string,
  recipientName: string | null,
  clientName: string | null,
  rating: number
): EmailContent {
  const t = makeT(locale);
  const body =
    paragraph(t("emails.greeting", { name: recipientName ?? "" })) +
    paragraph(t("emails.new_review.intro", { client: clientName ?? "" })) +
    row(t("emails.new_review.rating_label"), `${rating}/5`);
  return {
    subject: t("emails.new_review.subject"),
    html: layout(locale, t("emails.new_review.heading"), body),
  };
}
```

- [ ] **Step 4: Add the orchestrator**

In `src/lib/notifications/notify.ts`, add `newReviewEmail` to the import from `./templates`, then append:
```ts
/** → talachero, when a client leaves a review. Reuses the booking context
 * (talachero = recipient, client = author). Best-effort; never throws. */
export async function notifyNewReview(bookingId: string, rating: number): Promise<void> {
  try {
    const ctx = await getNotificationContext(createServiceClient(), bookingId);
    if (!ctx) return;
    const email = newReviewEmail(
      ctx.talachero.locale,
      ctx.talachero.name,
      ctx.client.name,
      rating
    );
    await sendEmail({ to: ctx.talachero.email, ...email });
  } catch (err) {
    console.error(`[notifications] notifyNewReview(${bookingId}) failed:`, err);
  }
}
```

- [ ] **Step 5: Verify typecheck + i18n key parity**

Run: `pnpm typecheck`
Expected: clean.
Run: `node -e "const a=require('./messages/es.json').emails.new_review,b=require('./messages/en.json').emails.new_review;const ka=Object.keys(a).sort().join(),kb=Object.keys(b).sort().join();if(ka!==kb){console.error('KEY DRIFT',ka,kb);process.exit(1)}console.log('emails.new_review keys match:',ka)"`
Expected: `emails.new_review keys match: heading,intro,rating_label,subject`.

- [ ] **Step 6: Commit**

```bash
git add messages/es.json messages/en.json src/lib/notifications/templates.ts src/lib/notifications/notify.ts
git commit -m "feat(reviews): new-review email template + notifyNewReview orchestrator"
```

---

## Task 6: `submitReview` server action

**Files:**
- Create: `src/app/[locale]/dashboard/bookings/[id]/review/actions.ts`

- [ ] **Step 1: Write the action**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { notifyNewReview } from "@/lib/notifications/notify";

export type ReviewState = { error?: string };

/** Client submits a review for a completed booking. On success: fire the
 * best-effort new-review email and redirect to the dashboard. On failure:
 * return a typed error code for the form to localize. */
export async function submitReview(
  _prev: ReviewState,
  formData: FormData
): Promise<ReviewState> {
  const bookingId = String(formData.get("bookingId") ?? "");
  const rating = Number(formData.get("rating")) || 0;
  const comment = String(formData.get("comment") ?? "");
  const locale = await getLocale();

  if (rating < 1 || rating > 5) {
    return { error: "invalid_rating" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_review", {
    p_booking_id: bookingId,
    p_rating: rating,
    p_comment: comment,
  });

  if (error) {
    // error.message is the raised code (e.g. 'already_reviewed').
    return { error: error.message };
  }

  await notifyNewReview(bookingId, rating);
  revalidatePath(`/${locale}/dashboard`);
  redirect(`/${locale}/dashboard?reviewed=1` as Route);
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/dashboard/bookings/[id]/review/actions.ts"
git commit -m "feat(reviews): submitReview server action"
```

---

## Task 7: Interactive star input + review form + page route

**Files:**
- Create: `src/components/ui/rating-input.tsx`
- Create: `src/app/[locale]/dashboard/bookings/[id]/review/review-form.tsx`
- Create: `src/app/[locale]/dashboard/bookings/[id]/review/page.tsx`
- Modify: `messages/es.json`, `messages/en.json` (add `reviews` namespace)

- [ ] **Step 1: Add the `reviews` UI namespace to `messages/es.json`**

Add a new top-level key (after `"chat"`):
```json
  "reviews": {
    "title": "Deja una reseña",
    "subtitle": "¿Cómo estuvo tu servicio con {name}?",
    "rating_label": "Calificación",
    "comment_label": "Comentario (opcional)",
    "comment_placeholder": "Cuéntanos cómo te fue…",
    "submit": "Enviar reseña",
    "back": "Volver al panel",
    "star_aria": "{n} de 5 estrellas",
    "error_invalid_rating": "Selecciona una calificación de 1 a 5.",
    "error_already_reviewed": "Ya dejaste una reseña para esta reserva.",
    "error_generic": "No se pudo enviar la reseña. Inténtalo de nuevo."
  }
```

- [ ] **Step 2: Add the same namespace to `messages/en.json`**

```json
  "reviews": {
    "title": "Leave a review",
    "subtitle": "How was your service with {name}?",
    "rating_label": "Rating",
    "comment_label": "Comment (optional)",
    "comment_placeholder": "Tell us how it went…",
    "submit": "Submit review",
    "back": "Back to dashboard",
    "star_aria": "{n} of 5 stars",
    "error_invalid_rating": "Please select a rating from 1 to 5.",
    "error_already_reviewed": "You already reviewed this booking.",
    "error_generic": "Could not submit the review. Please try again."
  }
```

- [ ] **Step 3: Build the interactive star input**

Create `src/components/ui/rating-input.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Star } from "lucide-react";

/** Controlled-by-hidden-input 1–5 star selector. Writes the chosen value into a
 * hidden <input name={name}> so it posts with the surrounding <form>. */
export function RatingInput({
  name,
  ariaLabel,
}: {
  name: string;
  ariaLabel: (n: number) => string;
}) {
  const [value, setValue] = useState(0);
  const [hover, setHover] = useState(0);
  const active = hover || value;

  return (
    <div className="flex items-center gap-1" role="radiogroup">
      <input type="hidden" name={name} value={value} />
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={ariaLabel(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => setValue(n)}
          className="text-text-primary p-0.5"
        >
          <Star
            className="h-7 w-7"
            aria-hidden
            fill={n <= active ? "currentColor" : "none"}
            strokeWidth={1.5}
          />
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Build the form client component**

Create `src/app/[locale]/dashboard/bookings/[id]/review/review-form.tsx`:
```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { RatingInput } from "@/components/ui/rating-input";
import { submitReview, type ReviewState } from "./actions";

const ERROR_KEYS: Record<string, string> = {
  invalid_rating: "error_invalid_rating",
  already_reviewed: "error_already_reviewed",
};

export function ReviewForm({ bookingId }: { bookingId: string }) {
  const t = useTranslations("reviews");
  const [state, formAction, pending] = useActionState<ReviewState, FormData>(
    submitReview,
    {}
  );

  const errorMsg = state.error
    ? t(ERROR_KEYS[state.error] ?? "error_generic")
    : null;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="bookingId" value={bookingId} />

      <div className="flex flex-col gap-2">
        <span className="text-text-secondary text-sm font-medium">
          {t("rating_label")}
        </span>
        <RatingInput name="rating" ariaLabel={(n) => t("star_aria", { n })} />
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-text-secondary text-sm font-medium">
          {t("comment_label")}
        </span>
        <textarea
          name="comment"
          rows={4}
          placeholder={t("comment_placeholder")}
          className="border-border-strong bg-surface text-text-primary rounded-md border px-3 py-2 text-sm"
        />
      </label>

      {errorMsg && <p className="text-text-primary text-sm">{errorMsg}</p>}

      <button
        type="submit"
        disabled={pending}
        className="bg-text-primary text-surface w-fit rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        {t("submit")}
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Build the page route (authorize + 404 if not reviewable)**

Create `src/app/[locale]/dashboard/bookings/[id]/review/page.tsx`:
```tsx
import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getAppUser } from "@/lib/auth";
import { getMyBookings } from "@/lib/data/bookings";
import { ReviewForm } from "./review-form";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const user = await getAppUser();
  if (!user) {
    redirect(`/${locale}/auth/sign-in` as Route);
  }

  // Only the booking's client can review it, only when completed and unreviewed.
  const booking = (await getMyBookings()).find((b) => b.id === id);
  if (!booking || booking.status !== "completed" || booking.hasReview) {
    notFound();
  }

  const t = await getTranslations("reviews");

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <Link
          href={"/dashboard" as Route}
          className="text-text-secondary hover:text-text-primary mb-4 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t("back")}
        </Link>
        <h1 className="text-text-primary text-2xl font-semibold">{t("title")}</h1>
        <p className="text-text-secondary mt-1 text-sm">
          {t("subtitle", { name: booking.talacheroName ?? "" })}
        </p>
      </div>
      <ReviewForm bookingId={booking.id} />
    </div>
  );
}
```

- [ ] **Step 6: Verify typecheck + lint + build**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.
Run: `pnpm build`
Expected: build succeeds (the new route compiles). If `.env.local` is present it's fine; the build must not require secrets.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/rating-input.tsx "src/app/[locale]/dashboard/bookings/[id]/review/" messages/es.json messages/en.json
git commit -m "feat(reviews): review form page, star input, and reviews i18n"
```

---

## Task 8: Dashboard prompt on the completed-booking card

**Files:**
- Modify: `src/app/[locale]/dashboard/page.tsx` (completed branch, ~lines 105-121)
- Modify: `messages/es.json`, `messages/en.json` (add `dashboard.review_cta`, `dashboard.reviewed`)

- [ ] **Step 1: Add the two dashboard strings to `messages/es.json`**

Inside `"dashboard"`, after `"tip_prompt"`:
```json
    "review_cta": "Dejar reseña",
    "reviewed": "Reseña enviada",
```

- [ ] **Step 2: Add them to `messages/en.json`**

```json
    "review_cta": "Leave a review",
    "reviewed": "Review submitted",
```

- [ ] **Step 3: Add the CTA to the completed-booking card**

In `src/app/[locale]/dashboard/page.tsx`, the completed branch currently renders only the tip `<form>`. Wrap it so the review CTA sits alongside the tip form. Replace the completed branch body:
```tsx
                ) : b.status === "completed" ? (
                  <div className="flex flex-col gap-2">
                    <form action={tipBooking} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="bookingId" value={b.id} />
                      <span className="text-text-secondary text-xs">{t("tip_prompt")}</span>
                      {TIP_PRESETS.map((a) => (
                        <button
                          key={a}
                          type="submit"
                          name="amount"
                          value={a}
                          className="border-border-strong text-text-primary hover:bg-surface-muted rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
                        >
                          +${a}
                        </button>
                      ))}
                    </form>
                    {b.hasReview ? (
                      <span className="text-text-secondary text-xs">{t("reviewed")}</span>
                    ) : (
                      <Link
                        href={`/dashboard/bookings/${b.id}/review` as Route}
                        className="border-border-strong text-text-primary hover:bg-surface-muted w-fit rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
                      >
                        {t("review_cta")}
                      </Link>
                    )}
                  </div>
                ) : null
```

- [ ] **Step 4: Ensure `Link` and `Route` are imported in the page**

At the top of `src/app/[locale]/dashboard/page.tsx`, confirm/add:
```ts
import type { Route } from "next";
import { Link } from "@/i18n/navigation";
```
(If `Link`/`Route` are already imported for other cards, skip. The chat "Mensajes" action already uses `Link`, so it likely exists — verify before adding to avoid a duplicate import.)

- [ ] **Step 5: Verify typecheck + lint + build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: clean; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/dashboard/page.tsx" messages/es.json messages/en.json
git commit -m "feat(reviews): completed-booking review prompt on the client dashboard"
```

---

## Task 9: Seed correction + full-reset verification

**Files:**
- Modify: `supabase/seed.sql` (stop hand-setting `rating_avg`/`rating_count`)

- [ ] **Step 1: Remove the hand-set aggregates from the seed**

In `supabase/seed.sql` (the `update public.talachero_profiles` block, ~lines 88-104), delete these two assignment lines so the trigger is the sole source of the aggregate:
```sql
      rating_avg          = t.rating,
      rating_count        = t.rcount,
```
Leave `jobs_completed = t.jobs` and everything else. `rating_avg`/`rating_count` keep their column defaults (0) until the seed's later review inserts fire the rollup trigger.

- [ ] **Step 2: Full reset (safe now — this is the deliberate clean-seed step)**

> Note: this wipes Stripe onboarding (expected for a clean seed; re-onboard later if needed). Do this only here.

Run: `pnpm exec supabase db reset`
Expected: migrations + seed apply cleanly, no error.

- [ ] **Step 3: Verify seeded aggregates now match real review rows**

Run:
```bash
docker exec supabase_db_talachas-mvp psql -U postgres -d postgres -c "
select p.user_id,
       p.rating_avg, p.rating_count,
       coalesce(round(avg(r.rating)::numeric,2),0) as real_avg,
       count(r.*) as real_count
from talachero_profiles p
left join reviews r on r.target_id = p.user_id
group by p.user_id, p.rating_avg, p.rating_count
having p.rating_count <> count(r.*)
    or p.rating_avg <> coalesce(round(avg(r.rating)::numeric,2),0);"
```
Expected: **0 rows** (every profile's stored aggregate equals its derived value — the trigger drove them during seeding).

- [ ] **Step 4: Manual end-to-end (with the stack running + a Resend key for the email leg)**

Bring up `pnpm dev`. As a client with a completed booking (seed data), open the dashboard → the completed card shows **"Leave a review"** → open it → pick stars + comment → submit → redirected to `/dashboard?reviewed=1`, card now shows **"Review submitted"**. Verify: (a) a `reviews` row exists; (b) the talachero's `rating_avg`/`rating_count` moved; (c) the talachero's profile page (`/talacheros/[id]`) shows the new review + updated summary; (d) revisiting the review URL 404s; (e) with `RESEND_API_KEY` set, the talachero gets the new-review email in their locale.

> If the seed has no completed booking for a signed-in demo client, complete one first via the talachero flow (accept → mark completed), then review it.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat(reviews): derive seed rating aggregates from real review rows"
```

---

## Self-review notes (author)

- **Spec coverage:** create_review RPC (T2), rollup trigger incl. DELETE for cycle-2 admin (T1), has_review (T3–T4), prompt + form route mirroring chat (T7–T8), immutable reviews (no update/delete path added), new-review email not quoting the comment (T5), seed decoupling fix (T9), client→talachero-only scope (no target/direction UI). Bidirectional, admin panel, 24h reminder, jobs_completed all explicitly out of scope — no tasks, matching the spec.
- **Type consistency:** `ReviewState`/`submitReview` (T6) are consumed exactly in T7's form; `newReviewEmail(locale, recipientName, clientName, rating)` (T5 template) matches its call in `notifyNewReview` (T5 notify); `hasReview` (T4) is produced by `has_review` (T3) and consumed in T7 page + T8 card.
- **No placeholders:** every code step is complete and runnable.
