# Phase 6 (cycle 1) — Reviews loop design

**Date:** 2026-07-06
**Status:** Draft for review
**Related:** `plan.md` Phase 6; PRD §7 (Review entity), §8 flow 3 ("ambos dejan reseña"); HANDOFF Phase 6 row. Cycle 2 (admin panel) is a **separate** spec/plan.

Phase 6 is two independent subsystems. This spec covers **cycle 1: the post-completion reviews loop only**. The admin panel (users/ban, bookings/refund, reviews/delete, disputes) is deferred to its own cycle-2 spec.

## Goal

Let a client leave a **1–5 star + optional comment** review on a **completed** booking; roll that into the talachero's directory rating automatically; surface the prompt in the client dashboard; and email the talachero. Close the marketplace loop (discover → book → pay → chat → complete → **review**).

## What already exists (reused, not rebuilt)

- **`reviews` table** (`20260703140003_...sql`) — bidirectional (`author_id`/`target_id` → `users`), `rating` 1–5 check, `comment`, `reviews_one_per_author unique (booking_id, author_id)`, `reviews_not_self check`. RLS: `"reviews are public"` (SELECT true), `"participants author their own reviews"` (INSERT `author_id = auth.uid() and is_booking_participant(booking_id)`). No UPDATE/DELETE policy → reviews immutable to users.
- **`get_talachero_reviews(p_id)`** read RPC (client→talachero) + display UI: `ReviewCard`, `Rating`, profile page reviews section, `TalacheroReview` view type + `toReview()` mapper.
- **`rating_avg numeric(3,2)` / `rating_count int`** stored columns on `talachero_profiles` — **currently hand-set in the seed, decoupled from real rows.**
- **`src/lib/notifications/`** module + `emails` i18n namespace (5B) — recipient-locale, best-effort, no-op without a key.
- Per-booking route pattern `/dashboard/bookings/[id]/chat` — mirrored for the review form.

## Scope decision: client → talachero only (bidirectional deferred)

MVP builds **only the client→talachero direction.** It feeds the directory rating (the marketplace-visible value), reuses the existing read RPC + display, and needs no new surface. Talachero→client reviews would require a client-rating display surface that doesn't exist — deferred; the table already supports it with **zero migration** when it lands. (PRD/plan describe bidirectional as the eventual state; this is an MVP scoping call, not a schema change.)

## Components

### 1. `create_review(p_booking_id uuid, p_rating int, p_comment text)` — SECURITY DEFINER RPC

New migration. Follows the established write-RPC pattern (validates `auth.uid()` internally, pinned `search_path`, granted to `authenticated`). Logic:

1. Load the booking row; typed error `booking_not_found` if absent.
2. Reject unless `booking.client_id = auth.uid()` → `not_your_booking`.
3. Reject unless `booking.status = 'completed'` → `booking_not_completed`.
4. Derive `target_id = (select user_id from talachero_profiles where id = booking.talachero_id)`.
5. `INSERT into reviews (booking_id, author_id=auth.uid(), target_id, rating, comment)`. The `reviews_one_per_author` unique violation is caught → typed error `already_reviewed`.
6. Return the new review id (or a typed result), matching how other booking RPCs return.

Rating is validated 1–5 both by the table `check` and defensively in the RPC. Empty comment stored as `null`.

### 2. Rating rollup — AFTER INSERT OR DELETE trigger on `reviews` (Option A)

New migration. A `SECURITY DEFINER` trigger function recomputes, for the affected `target_id`:

```
update talachero_profiles
set rating_avg  = coalesce((select round(avg(rating)::numeric, 2) from reviews where target_id = <uid>), 0),
    rating_count = (select count(*) from reviews where target_id = <uid>)
where user_id = <uid>;
```

- Fires on **INSERT** (new review) and **DELETE** (so cycle-2 admin "delete review" fixes the rollup for free). Uses `NEW.target_id` on insert, `OLD.target_id` on delete.
- **Seed correction:** stop hand-setting `rating_avg`/`rating_count`; let the trigger derive them from the seeded review rows (or run a one-time recompute in the seed after inserts). `jobs_completed` stays as-is (deriving it from completed bookings is out of scope — separate concern).

### 3. `has_review` on `get_my_bookings`

Return-shape change → **DROP then CREATE** (per the established gotcha; `CREATE OR REPLACE` can't alter OUT columns). Add a boolean column:

```
exists (select 1 from reviews r where r.booking_id = b.id and r.author_id = auth.uid()) as has_review
```

Mirror the new column into the `ClientBooking` view type + mapper in `src/lib/data/bookings.ts`. Regenerate `database.types.ts`; add any alias in `types.ts`.

### 4. Review submission UI

- **Prompt:** on the client dashboard **completed-booking card** (the slot that today renders the tip form), add a **"Leave a review"** link when `!has_review`, or a static **"Reviewed"** indicator when `has_review`. Tip and review coexist.
- **Form route:** `/dashboard/bookings/[id]/review` — a small server-rendered page (mirrors the existing chat route), authorized via the caller's own `get_my_bookings` projection (**404 for non-owners / non-completed / already-reviewed**). Renders a **1–5 star selector + optional comment textarea**, submitted through a server action calling `create_review`, then `redirect` back to `/dashboard` with a success flag. Reuses the `Rating` component's visual language for the interactive selector.
- Reviews are **immutable** (no edit/delete for users; admin delete is cycle 2).

### 5. New-review email (closes a deferred 5B item)

On `create_review` success, best-effort `notify` the **talachero** (their `users.locale`) that they received a review, reusing `src/lib/notifications/` + a new key set in the `emails` namespace (`messages/{es,en}.json`, kept in sync). Same guarantees as 5B: never throws into the action, no-ops without `RESEND_API_KEY`, HTML-escapes any user-controlled interpolation. The email states a review was left and links to the profile; **it does not quote the comment body** (avoids echoing unmoderated user text into email — the comment is visible in-app).

## Data flow

Talachero marks the booking `completed` → client dashboard card shows "Leave a review" → `/dashboard/bookings/[id]/review` form → server action → `create_review` RPC (validates, inserts) → **trigger** recomputes `rating_avg`/`rating_count` → action fires best-effort **new-review email** → redirect to dashboard (card now shows "Reviewed"). Directory + profile immediately reflect the new aggregate on next read.

## Error handling

- RPC returns **typed errors** (`booking_not_found`, `not_your_booking`, `booking_not_completed`, `already_reviewed`); the server action maps them to localized messages, matching existing booking-action error handling.
- The route **404s** for any booking the caller can't review (non-owner, non-completed, already-reviewed) rather than rendering a dead form.
- Email is best-effort; a send failure never blocks the review.

## i18n

New UI strings (prompt, form labels, star aria-labels, success/error messages) and email copy added to **both** `messages/es.json` and `messages/en.json`, same key set (drift-checked). Spanish default.

## Verification

Typecheck + lint + secretless build. Manual: complete a booking → leave a review → assert (a) `reviews` row, (b) `rating_avg`/`rating_count` updated by the trigger and reflected on the profile/directory, (c) card flips to "Reviewed" + form route 404s on re-visit, (d) `already_reviewed` on duplicate attempt, (e) new-review email to the talachero in their locale (with a Resend key). Add a rollup sanity check: insert/delete a review row directly and confirm the aggregate tracks.

## Out of scope (this cycle)

- **Bidirectional** (talachero→client) reviews + any client-rating surface.
- **Admin panel** (users/ban, bookings/refund, reviews/delete, disputes) — cycle 2.
- **24h reminder email** (needs cron/scheduler) — stays deferred.
- Deriving `jobs_completed` from bookings; editing reviews; review photos; partial/tiered anything.

## Open questions

None blocking. Bidirectional scope is the one judgment call, resolved above (deferred) — reversible without migration.
