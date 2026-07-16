# Talachero Profile Editor — Design

**Date:** 2026-07-16
**Status:** Approved (brainstorming) — ready for implementation plan
**Sprint task:** Sprint 2 · Autoservicio de prestadores — "Editor de perfil del prestador (foto, bio, servicios, precios)"

## Summary

Give a signed-in talachero a self-service editor for their own profile. This first
version covers the **core fields**: bio, hourly rate, services (multi-select of the
8 fixed categories + one primary), and years of experience. It replaces the
"coming soon" placeholder on the talachero dashboard with a working form.

**Deferred (own follow-up tasks):**
- **Portfolio photos** — needs a Supabase Storage bucket + signed-upload flow (no
  storage infra exists yet).
- **Coverage zone** (center point + radius) — needs a map/geocoding picker, and the
  search that would consume it is still backlog, so it would be write-only today.

## Context / constraints discovered

- `talachero_profiles` is 1:1 with a talachero user; the `handle_new_user` trigger
  already inserts an **empty profile shell** at signup, so a row always exists — no
  insert path is needed, the form just renders blank/zero values for a fresh profile.
- **`revoke update on public.talachero_profiles from authenticated`** (migration
  `20260703170001_stripe_fields.sql`): direct table updates are revoked from the
  authenticated role, so the RLS "update your own profile" policy is dead for direct
  writes. **Every profile mutation must go through a `SECURITY DEFINER` RPC** — the
  same pattern as `bookings` and `create_booking`/`respond_to_booking`.
- `rating_avg` / `rating_count` are separately revoked and trigger-managed; stripe /
  verification columns are service-role-only. The editor must never touch these.
- Services live in the `talachero_services` join table
  (`talachero_id`, `service_category_id`, `is_primary`), keyed to the 8 rows in
  `service_categories` (slugs: handyman, furniture_assembly, cleaning, moving,
  tv_mount, gardening, delivery, painting).
- Existing form convention: `useActionState` + a server action (as in
  `sign-in-form`, `review-form`, `dispute-form`), with DB error codes mapped to
  `error_*` i18n keys. Primitives: `Input`, shared `Button`, grayscale error banner.

## Architecture (5 layers)

### 1. Database — new migration: `update_talachero_profile` RPC

`SECURITY DEFINER`, validates `auth.uid()` owns a talachero profile, does everything
in one transaction:

- Looks up the caller's `talachero_profiles` row via `user_id = auth.uid()`; raises
  if none (defensive — the role guard should prevent this).
- Validates inputs and raises coded exceptions on failure (see Validation).
- Updates **only** `bio`, `hourly_rate`, `years_experience` on the profile row.
- Replaces the services set: `delete from talachero_services where talachero_id = …`,
  then inserts the selected `service_category_id`s (resolved from slugs), flagging the
  primary with `is_primary = true`.

Because the function is `SECURITY DEFINER`, it runs as owner and is not blocked by the
column revokes — correctness depends on the body only ever setting the allowed columns.

Follow the repo convention: `DROP` then `CREATE` if return columns ever change; after
the migration run `supabase gen types` to regenerate `database.types.ts`, and add any
new alias to hand-maintained `types.ts`.

### 2. Data layer — `src/lib/data/talacheros.ts`

Add `getMyTalacheroProfileForEdit()`:

- Reads the caller's own profile (RLS SELECT allows `user_id = auth.uid()`), joined to
  `talachero_services` → `service_categories.slug`.
- Returns the camelCase view shape:
  `{ bio: string; hourlyRate: number | null; yearsExperience: number | null;
     services: ServiceSlug[]; primaryService: ServiceSlug | null }`.
- Returns `null` if the caller has no profile.

### 3. Server action — `src/app/[locale]/dashboard/talachero/profile/actions.ts`

`updateTalacheroProfile(prevState, formData): Promise<ProfileState>` using
`useActionState`:

- `ProfileState = { status: "idle" | "success" | "error"; error?: string }`.
- Parses `bio`, `hourlyRate`, `yearsExperience`, `services` (multi-value), `primary`.
- Calls `supabase.rpc("update_talachero_profile", { … })`.
- Maps the RPC's coded exceptions to `error_*` keys; unknown → `error_generic`.
- On success: `revalidatePath` the profile page **and** the public
  `/talacheros/[id]` route is covered by its own dynamic fetch, so no extra work;
  returns `{ status: "success" }`.

### 4. UI — dedicated route

`src/app/[locale]/dashboard/talachero/profile/page.tsx` (server component):
- Role guard (redirect non-talacheros), load `getMyTalacheroProfileForEdit()`, render
  `<ProfileForm initial={…} />`.

`src/app/[locale]/dashboard/talachero/profile/profile-form.tsx` (client):
- `useActionState(updateTalacheroProfile, { status: "idle" })`.
- Fields: bio `<textarea>`, hourly rate `Input[type=number]`, years experience
  `Input[type=number]`, and a **services multi-select**.
- **Services multi-select UX:** the 8 categories render as toggle chips (reusing the
  selected-state chip styling from `search-results` / `booking-form` — kept as raw
  toggle buttons, since they are selection controls, not action CTAs). Each *selected*
  chip exposes a "★ principal" affordance to mark the primary. Deselecting the current
  primary auto-promotes the first remaining selection client-side, so an orphaned
  primary can never be submitted. Selected slugs post as repeated hidden inputs named
  `services` (read via `formData.getAll("services")`); the primary slug posts as a
  single hidden input named `primary`.
- Submit: shared `Button`, following the `sign-in-form` pattern on `main` — `disabled`
  while pending with a submitting label. (Once the button-states polish PR merges, this
  can adopt the `loading` prop; not depended on here to keep the PRs independent.)
- Success/error banner reusing the grayscale banner style (icon + text, no red fill).

### 5. Wire-up

- Replace the `talachero_profile` `PlaceholderPanel` in
  `dashboard/talachero/page.tsx` with a real card linking to
  `/dashboard/talachero/profile` (edit-profile CTA).
- Add `messages/es.json` + `messages/en.json` keys under a `talachero_profile` (or
  `profile_editor`) namespace: field labels, the 8 service names already exist under
  `services.*`, validation `error_*` keys, and the success message. Keep both locales
  in sync (Spanish is the default).

## Validation rules

Enforced in the RPC (source of truth), mirrored in the form for fast feedback:

| Field | Rule | Error code |
|---|---|---|
| `bio` | optional, trimmed, ≤ 600 chars | `bio_too_long` |
| `hourly_rate` | required, numeric, 50–2000 (MXN) | `rate_out_of_range` |
| `years_experience` | optional, integer 0–60 | `experience_invalid` |
| services | ≥ 1 selected | `no_service` |
| primary | required, must be one of the selected slugs | `primary_not_selected` |

## Error handling

- RPC not-owner / no-profile → `error_generic` (guarded, shouldn't surface).
- Action never throws out of the form; returns a typed `ProfileState`.
- Save is atomic in the RPC: either the profile row + full services set update, or
  nothing.

## Notes / non-goals

- Editing `hourly_rate` or services affects **future** bookings only; existing
  bookings snapshot their price at creation, so no backfill.
- No new npm dependencies.
- Deferred: portfolio photos, coverage zone (each its own task).

## Testing / verification

No test runner in this repo. Verification = **typecheck + lint + build clean**, then a
driven walkthrough:

1. Sign in as a seeded talachero (`password123`).
2. Open `/dashboard/talachero/profile`; edit bio, rate, years; change the service set
   and primary; save.
3. Confirm: (a) success banner, (b) values persist on reload, (c) the change reflects
   on the public `/talacheros/[id]` profile.
4. Confirm the RPC rejects an out-of-range rate and an empty services set.

Use `supabase migration up` (not `db reset`) so existing Stripe onboarding state
survives, per the project note on `db reset` wiping onboarding.
