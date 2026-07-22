# Self-Service Talachero Onboarding — Design

**Date:** 2026-07-22
**Status:** Approved (brainstorming) — ready for implementation plan
**Sprint task:** Sprint 2 · Autoservicio de prestadores — "Registro y onboarding de prestadores (autoservicio)" / "Diseñar flujo de onboarding de prestadores"

## Summary

Give a newly signed-up talachero a guided path to become live on the marketplace,
gated by **admin review**. The building blocks already exist — the profile editor,
the availability editor, and Stripe Connect onboarding are all shipped — so this
feature is the **orchestration + gating layer** that ties them together, adds a
"submitted → reviewed" state machine, and gives admins an approval queue.

**Flow:** sign up (role talachero) → complete **profile** + **availability** →
**submit for review** → admin **approves** (→ listed in the directory) or **rejects**
with a reason (→ talachero fixes and re-submits). Stripe Connect onboarding is a
**parallel** step: needed to receive *paid* bookings (`charges_enabled`), not to get
listed.

**Deferred (own follow-up tasks, not this build):**
- Coverage-zone / work-area (pairs with the neighborhood `ST_DWithin` search).
- A separate ID-document upload — Stripe Connect Express KYC covers identity for MVP.
- The autoservicio QA automation suite (its own Notion task).

## Context / constraints discovered

- **`handle_new_user` trigger** (`20260703140002_users_profiles.sql`) already inserts
  an **empty talachero profile shell** at signup with `verification_status` defaulting
  to `'pending'`. So a new talachero always has a row to read/update — no insert path
  needed.
- **`verification_status` enum** = `pending | verified | rejected`
  (`20260703140001_extensions_enums_reference.sql`), default `pending`.
- **The directory gates on `verification_status = 'verified'`** — `list_talacheros`
  (`20260703150002_directory_functions.sql:60`) only returns verified talacheros. So a
  `pending`/`in_review`/`rejected` talachero is already invisible; **no directory
  change is needed** — the new enum value is naturally excluded.
- **Stripe currently auto-verifies (must change).** The `account.updated` webhook
  (`src/app/api/stripe/webhook/route.ts:74`) and the `refreshOnboarding` payment
  action (`src/app/[locale]/dashboard/talachero/payment-actions.ts:99`) set
  `verification_status = charges && payouts ? 'verified' : 'pending'`. With an
  admin-review gate, **verification becomes admin-driven only** — these two writes must
  stop setting `verification_status` (they keep writing `charges_enabled` /
  `payouts_enabled`).
- **Money/verification columns are server-only** — `talachero_profiles` has
  `REVOKE UPDATE … FROM authenticated` on Stripe/verification columns, so every
  verification transition must go through a `SECURITY DEFINER` RPC (same posture as
  `bookings`, `create_review`, `raise_dispute`).
- **Admin RPC pattern exists**: `is_admin(auth.uid())`-gated curated read + write RPCs
  with `SELECT … FOR UPDATE` guards (`admin_list_disputes`, `admin_resolve_dispute` in
  `20260707140001_disputes.sql`) — mirror it. The admin panel UI pattern
  (`/dashboard/admin/*` sub-routes, shared confirm-button, overview cards) is
  established.
- **Editors already exist**: `/dashboard/talachero/profile` (bio/rate/services),
  `/dashboard/talachero/availability` (slots), and the `PaymentsPanel` (Stripe). The
  talachero dashboard (`dashboard/talachero/page.tsx`) already links the first two and
  renders `PaymentsPanel`.
- **"Profile complete"** for onboarding = `hourly_rate` set **and** ≥1
  `talachero_services` row (bio optional — it's optional in the editor). **"Availability
  set"** = ≥1 `availability_slots` row with `status='open'` and `start_time >= now()`.

## State model

`verification_status` enum gains **`in_review`** → `pending | in_review | verified | rejected`:

| State | Meaning | Set by |
|---|---|---|
| `pending` | New / incomplete, not yet submitted (default) | signup trigger |
| `in_review` | Submitted, awaiting admin | `submit_talachero_for_review` |
| `verified` | Admin-approved → shows in directory | `admin_review_talachero` (approve) |
| `rejected` | Admin-rejected with a reason; can re-submit | `admin_review_talachero` (reject) |

New `talachero_profiles` columns:
- `rejection_reason text` — set on reject, cleared on submit and on approve.
- `submitted_at timestamptz` — set on submit; orders the admin queue oldest-first.

Gating (unchanged, now independent): **directory visibility** = `verification_status =
'verified'` (admin); **payable** = `charges_enabled` (Stripe). An approved talachero
with no Stripe is listed but `confirmBooking` still returns `talachero_not_payable`
(pre-existing behavior for seed talacheros — acceptable for MVP).

## Architecture

### 1. Database — two migrations

**Migration A — `20260722130001_verification_in_review_enum.sql`** (isolated):
```sql
alter type public.verification_status add value if not exists 'in_review';
```
It lives in its **own migration file** because Postgres will not let a newly-added
enum value be *used* in the same transaction it was added in. Nothing else goes in
this file. (Family of the repo's DROP-then-CREATE enum/OUT-column gotcha.)

**Migration B — `20260722130002_talachero_onboarding.sql`** — the columns + three
`SECURITY DEFINER` RPCs (typed error strings mapped to i18n codes in the app):

- `submit_talachero_for_review() returns void`
  - Resolve caller's `talachero_profiles` via `user_id = auth.uid()`; none →
    `not_authorized`.
  - Require current `verification_status in ('pending','rejected')` — else
    `already_submitted` (if `in_review`) / `already_verified` (if `verified`).
  - Validate **profile complete**: `hourly_rate is not null` and
    `exists (select 1 from talachero_services where talachero_id = <me>)` — else
    `profile_incomplete`.
  - Validate **availability**: `exists (select 1 from availability_slots where
    talachero_id = <me> and status='open' and start_time >= now())` — else
    `no_availability`.
  - Set `verification_status='in_review'`, `submitted_at=now()`,
    `rejection_reason=null`.
- `admin_list_verifications() returns table(...)` — `is_admin(auth.uid())` (else
  `not_authorized`); curated projection of `in_review` talacheros: `talachero_id`,
  `full_name`, `bio`, `hourly_rate`, `currency`, service slugs (array/agg), upcoming
  open-slot count, `charges_enabled`, `submitted_at` — ordered by `submitted_at asc`.
- `admin_review_talachero(p_talachero_id uuid, p_approve boolean, p_reason text) returns void`
  - `is_admin(auth.uid())` else `not_authorized`.
  - `SELECT … FOR UPDATE` the target profile; require `verification_status='in_review'`
    else `not_in_review` (so two admins can't double-review).
  - approve → `verification_status='verified'`, `rejection_reason=null`.
  - reject → require `nullif(btrim(p_reason),'') is not null` else `empty_reason`;
    set `verification_status='rejected'`, `rejection_reason = btrim(p_reason)`.

Grants: `submit_talachero_for_review` → `authenticated`; the two admin RPCs →
`authenticated` (they self-gate on `is_admin`). Repo conventions: `DROP` then `CREATE`
if OUT columns change; run `supabase gen types` after; no hand-`types.ts` alias needed
unless a new row/enum alias is wanted (the enum value flows in automatically).

### 2. Decouple Stripe from verification (behavioral change)

- `src/app/api/stripe/webhook/route.ts` (`account.updated`, ~line 74): remove the
  `verification_status: …` field from the `.update({...})` — keep `charges_enabled` /
  `payouts_enabled`.
- `src/app/[locale]/dashboard/talachero/payment-actions.ts` (`refreshOnboarding`,
  ~line 99): same removal.

Verification is now set only by the submit/admin RPCs. Existing `verified` talacheros
are untouched (we never downgrade). New talacheros must be admin-approved.

### 3. Data layer — `src/lib/data/talacheros.ts`

`getMyOnboardingStatus(): Promise<OnboardingStatus | null>`:
- Resolve caller's profile (reuse the `auth.getUser()` → `talachero_profiles` pattern).
- Return `{ status: VerificationStatus; rejectionReason: string | null;
  profileComplete: boolean; hasAvailability: boolean; chargesEnabled: boolean }`,
  computing `profileComplete` (`hourly_rate != null` && ≥1 service) and `hasAvailability`
  (≥1 upcoming open slot) with lightweight queries.
- `null` if the caller has no profile.

### 4. Talachero side — server action + checklist UI

- Server action `src/app/[locale]/dashboard/talachero/onboarding-actions.ts` →
  `submitForReview(): Promise<SubmitResult>` calling
  `submit_talachero_for_review`, mapping the coded errors to a translatable set
  (`profile_incomplete`, `no_availability`, `already_submitted`, `already_verified`,
  `generic`), `revalidatePath` the dashboard. `SubmitResult = { ok: true } | { ok:
  false; error: string }`.
- **`OnboardingChecklist`** client component rendered at the **top of
  `dashboard/talachero/page.tsx`** when `status !== 'verified'` (collapses to a compact
  "¡Estás en vivo!" note when verified):
  - Three step rows with ✓/○: **Perfil** (`profileComplete` → link `/profile`),
    **Disponibilidad** (`hasAvailability` → link `/availability`), **Pagos**
    (`chargesEnabled` → anchors to the existing `PaymentsPanel`; labelled *opcional para
    aparecer, requerido para cobrar*).
  - **"Enviar a revisión"** submit button — enabled only when `profileComplete &&
    hasAvailability && status in ('pending','rejected')`; posts to `submitForReview`.
  - Status region:
    - `in_review` → "En revisión — te avisaremos" (submit hidden).
    - `rejected` → grayscale banner with `rejectionReason` + "corrige y reenvía"
      (submit shown, relabelled "Reenviar a revisión").
    - `pending` → the checklist + submit (disabled until complete).
  - Grayscale banner styling + `Button`/`buttonVariants`, matching profile/availability.
- The existing profile/availability link cards + `PaymentsPanel` stay on the dashboard
  (the checklist references the same steps; no duplication of the editors).

### 5. Admin side — verification queue

- Reader `src/lib/data/admin.ts` → `getVerificationQueue()` calling
  `admin_list_verifications`, mapped to a camelCase view shape.
- Server actions in the admin area → `approveTalachero(talacheroId)` and
  `rejectTalachero(talacheroId, reason)` calling `admin_review_talachero`.
- Route `src/app/[locale]/dashboard/admin/verifications/page.tsx` (admin role guard,
  mirrors `/dashboard/admin/disputes`): a list of `in_review` talacheros showing
  name, bio, services, rate, upcoming-slot count, Stripe status, and submit time, each
  with **Aprobar** / **Rechazar** confirm actions (reject reveals a reason input; reuse
  the shared confirm-button pattern). Add a **fifth admin overview card** on
  `/dashboard/admin` linking here (with a pending count if cheap).

### 6. i18n

New `onboarding` namespace (talachero checklist: step labels, the *optional/required*
hints, submit/resubmit CTAs, `in_review`/`rejected`/`verified`/live copy, the
`error_*` submit codes) and `admin.verifications` namespace (queue labels, approve/
reject, reason prompt, empty state). `messages/{es,en}.json` kept in sync (Spanish
default).

## Validation rules

Enforced in the RPCs (source of truth), mirrored in the UI for fast feedback:

| Rule | Where | Error code |
|---|---|---|
| profile has rate + ≥1 service | `submit_talachero_for_review` | `profile_incomplete` |
| ≥1 upcoming open slot | `submit_talachero_for_review` | `no_availability` |
| status must be pending/rejected to submit | `submit_talachero_for_review` | `already_submitted` / `already_verified` |
| reject requires a non-empty reason | `admin_review_talachero` | `empty_reason` |
| can only review an `in_review` profile | `admin_review_talachero` | `not_in_review` |
| non-admin calls admin RPCs / non-owner submit | all | `not_authorized` |

## Error handling

- Actions never throw out of a form; they return a typed result and map codes to
  `error_*` i18n keys (allowlisted set → unknown collapses to `generic`).
- Each RPC is atomic; `admin_review_talachero` locks the row (`FOR UPDATE`) so
  concurrent reviews serialize and the loser gets `not_in_review`.

## Notes / non-goals

- Directory + booking gates unchanged; the new enum value is excluded from
  `list_talacheros` automatically (it filters `= 'verified'`).
- Stripe stays independent: approved-but-not-onboarded talacheros are listed but not
  payable (existing behavior).
- No new npm dependencies. No cron.
- Deferred: coverage-zone, separate ID upload, QA automation suite.

## Testing / verification

No test runner in this repo. Verification = **typecheck + lint + secretless build
clean**, then:

1. **DB-level (auth-simulation, rolled back):**
   - `submit_talachero_for_review`: `profile_incomplete` (no rate/service),
     `no_availability` (no upcoming slot), happy path → `in_review` + `submitted_at`
     set; re-submit while `in_review` → `already_submitted`.
   - `admin_review_talachero`: approve → `verified`; reject with empty reason →
     `empty_reason`; reject with reason → `rejected` + `rejection_reason`; re-review →
     `not_in_review`; non-admin → `not_authorized`.
   - `admin_list_verifications` returns the `in_review` row for an admin.
   - After approve, `list_talacheros` includes the talachero; while `in_review`/
     `rejected`/`pending` it does not.
2. **Stripe decouple:** simulate `account.updated` (or `refreshOnboarding`) →
   `charges_enabled` flips but `verification_status` is unchanged.
3. **Browser pass:** as a fresh talachero — dashboard shows the checklist; complete
   profile + availability → "Enviar a revisión" enables → submit → "En revisión". As
   admin → `/dashboard/admin/verifications` → reject with a reason → talachero sees the
   reason + re-submits → admin approves → talachero dashboard shows "¡Estás en vivo!"
   and the talachero appears in `/talacheros`. Zero console errors.

Use `supabase migration up` (not `db reset`) so existing Stripe onboarding survives.
Both migrations must go to the cloud via `db push` before this works in production.
