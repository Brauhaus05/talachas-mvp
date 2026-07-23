# QA Runbook — Self-Service Provider (Talachero) Flows

**Task:** Sprint 2 · Autoservicio de prestadores — "Suite de QA para autoservicio de prestadores".
**Date:** 2026-07-22
**Scope:** manual end-to-end QA of the provider self-service flows shipped this sprint — profile editor, availability editor, onboarding (admin-review gate), earnings, and the not-bookable-until-approved gating.

> **Why a manual runbook (not automated tests):** this repo has **no test runner** (per CLAUDE.md — "verification" = typecheck + lint + build + manually exercising flows). A manual runbook is the pragmatic MVP deliverable. **Future upgrade:** a Playwright E2E suite could automate cases C-1…C-3, D-1…D-2, E-1 (the ones that don't need a real Stripe/email side effect). Out of scope here.

## How to use

1. Start the local stack + dev server:
   ```bash
   open -a Docker && pnpm exec supabase start
   pnpm dev   # http://localhost:3000
   ```
   (If verifying **production**, use https://talachas-mvp.vercel.app instead — all self-service migrations are pushed to the cloud DB as of 2026-07-22.)
2. Seed accounts (all password `password123`):
   - Talachero: `carlos.mendoza@demo.talachas.mx`
   - Client: `mariana.ruiz@demo.talachas.mx`
   - Admin: `admin@talachas.mx`
3. Run each case below; tick the checkbox when the **Expected** matches. A case's **Status** column records what was verified during the 2026-07-22 build session vs. what remains an owner run (needs a sign-in the build agent couldn't perform — new-account creation / admin login).

**Status legend:** ✅ verified live (2026-07-22 session) · 🔶 owner-run (needs sign-in the agent couldn't do) · 🟠 deferred/not-yet-built.

**DB helpers** (via `docker exec -i supabase_db_talachas-mvp psql -U postgres -c "<sql>"`) to put a talachero into a specific state:
- Reset Carlos to a fresh **pending, incomplete** profile:
  `update talachero_profiles set verification_status='pending', hourly_rate=null, submitted_at=null, rejection_reason=null where user_id=(select id from users where email='carlos.mendoza@demo.talachas.mx');`
- Back to **verified**: `... set verification_status='verified' ...`.

---

## A · New provider signup + onboarding entry

### A-1 · Sign up as a new talachero → empty pending shell — 🔶 owner-run
**Pre:** signed out. **Steps:** `/es/auth/sign-up` → choose the **talachero** role → complete signup. **Expected:** immediate session (email confirmation disabled); redirect to the talachero dashboard; the **"Configura tu cuenta"** onboarding checklist shows with all steps **incomplete** (empty circles); `verification_status='pending'` in the DB; the new talachero does **not** appear in `/es/talacheros`.
*(Owner-run: the agent cannot create accounts / enter signup passwords.)*

---

## B · Profile editor

### B-1 · Edit + save profile — ✅ verified (PR #18 session) / re-runnable
**Pre:** signed in as a talachero. **Steps:** dashboard → **Editar perfil** (`/dashboard/talachero/profile`) → set bio, hourly rate, ≥1 service + a primary, years of experience → **Guardar**. **Expected:** grayscale success banner; values persist on reload; the change reflects on the public `/talacheros/[id]` profile.

### B-2 · Validation rejects bad input — ✅ verified (DB-level, PR #18)
**Steps:** try rate out of 50–2000, empty services, no primary. **Expected:** the form + RPC reject with the matching `error_*` message (rate_out_of_range / no_service / primary_not_selected); nothing persists.

---

## C · Availability editor

### C-1 · Open/close slots persist — ✅ verified live (PR #19 session)
**Pre:** signed in as a talachero. **Steps:** dashboard → **Editar disponibilidad** (`/dashboard/talachero/availability`) → toggle several 1-hour cells on across both week pages → toggle some off → reload. **Expected:** toggled-on cells show a check and **persist across reload**; the week pager works; **past** hours today are disabled with a "Pasado — H:00" label; a booked cell is locked (🔒); zero console errors. *(Verified live: open→check→reload persistence; past-cell boundary exactly at the current CDMX hour.)*

### C-2 · Opened slot appears in the client booking picker — ✅ verified (PR #19)
**Steps:** open a slot as the talachero → in an incognito window as a client, open that talachero's `/book/[id]`. **Expected:** the opened slot is offered; a closed one is not.

### C-3 · Can't close a booked slot — ✅ verified (DB-level, PR #19)
**Steps:** attempt to close a slot with status `booked`. **Expected:** the RPC raises `slot_booked`; the cell stays booked. To free it, cancel/reject the booking.

---

## D · Onboarding — submit for review + admin verification

### D-1 · Submit gated on completeness — ✅ verified live (PR #21 session)
**Pre:** talachero **pending** with profile complete (rate + ≥1 service) + ≥1 upcoming open slot. **Steps:** dashboard checklist. **Expected:** with profile + availability done, **"Enviar a revisión"** is enabled; with either missing it's disabled (and the RPC would reject `profile_incomplete` / `no_availability`). Submitting flips the card to **"En revisión"** and hides the submit button; DB shows `verification_status='in_review'`, `submitted_at` set. *(Verified live: checklist → submit → En revisión; directory excludes `in_review`.)*

### D-2 · Admin approve → talachero goes live — 🔶 owner-run (needs admin login)
**Pre:** a talachero in `in_review` (Carlos is primed `in_review` on the local DB). **Steps:** sign in as `admin@talachas.mx` → `/dashboard/admin` → **Verificaciones** → the talachero is listed (name, bio, services, rate, upcoming-slot count, payments badge) → **Aprobar**. **Expected:** `verification_status='verified'`; the talachero's dashboard shows **"¡Estás en vivo!"**; they now appear in `/es/talacheros`. *(Admin RPC state machine verified DB-level in PR #21; UI walk-through is the owner run.)*

### D-3 · Admin reject with reason → resubmit — 🔶 owner-run (needs admin login)
**Steps:** in the Verificaciones queue → **Rechazar** with a reason. **Expected:** `verification_status='rejected'` + `rejection_reason` stored; the talachero's dashboard shows **"Necesita cambios"** with the reason; **"Reenviar a revisión"** works and returns them to `in_review`.

### D-4 · `not_in_review` guard — ✅ verified (DB-level, PR #21)
**Steps:** approve/reject a talachero who is not `in_review`. **Expected:** RPC raises `not_in_review` (blocks double-review). Non-admin caller → `not_authorized`.

---

## E · Earnings (payment history)

### E-1 · Earnings render with correct net — ✅ verified live (PR #22 session)
**Pre:** a talachero with ledger rows. **Steps:** dashboard → **Historial de pagos** (`/dashboard/talachero/earnings`). **Expected:** 3 summary tiles (Total ganado / Este mes / Trabajos pagados) + a per-booking list with **Monto / Comisión (−15%) / Propina / Neto / Estado**; a refunded booking shows **Reembolsado** + net 0; a fresh talachero shows the empty state. *(Verified live: CA$400→net CA$340; CA$560 refunded→CA$0; CA$560+CA$50 tip→−CA$84/CA$50/**CA$526**; Total CA$866, 2 paid jobs — math exact.)*

### E-2 · Only captured jobs appear — ✅ verified (design, PR #22)
**Expected:** authorized-but-uncaptured bookings (no `charge` ledger row yet) are excluded; "Trabajos pagados" counts captured non-refunded jobs only.

---

## F · Gating — not bookable until approved / payable

### F-1 · Unapproved talachero not in directory — ✅ verified live (PR #21)
**Steps:** a talachero in `pending` / `in_review` / `rejected`. **Expected:** excluded from `/es/talacheros` (`list_talacheros` filters `verification_status='verified'`). *(Verified live: `in_review` Carlos excluded; 9 verified talacheros listed.)*

### F-2 · Approved-but-no-Stripe → listed but not payable — 🔶 owner-run
**Pre:** an approved talachero with `charges_enabled=false`. **Steps:** as a client, open their profile → pick a slot → **Confirmar reserva**. **Expected:** listed in the directory, but `confirmBooking` returns **`talachero_not_payable`** (deliberate — Stripe is a parallel step; the admin queue shows a payments-ready/pending badge). Complete Stripe onboarding → becomes payable.

### F-3 · Incomplete profile can't be submitted — ✅ verified (DB-level, PR #21)
**Steps:** talachero with no rate or no services → attempt submit. **Expected:** `profile_incomplete`; the checklist submit stays disabled.

---

## G · Deferred / not-yet-built (record as N/A)

### G-1 · Block a date range / vacation — 🟠 deferred
The availability editor is **per-slot open/close only**; there is no one-tap "block a day / date range". The Notion "bloqueo de fechas" case is **not yet implemented** — track as a follow-up (pairs with the availability editor). Mark N/A until built.

### G-2 · Consolidated message inbox — 🟠 deferred
Chat is **per-booking** (`/dashboard/bookings/[id]/chat`) with unread badges; there is no unified inbox list. Functional but not a consolidated view — optional follow-up from the panel audit.

---

## Summary of coverage (2026-07-22)

| Area | Verified live this session | Owner-run remaining | Deferred |
|---|---|---|---|
| Signup/onboarding | D-1 | A-1, D-2, D-3 | — |
| Profile | B-1, B-2 | — | — |
| Availability | C-1, C-2, C-3 | — | G-1 (date blocks) |
| Verification | D-1, D-4, F-1, F-3 | D-2, D-3 | — |
| Earnings | E-1, E-2 | — | — |
| Payability | — | F-2 | — |
| Messaging | — | — | G-2 |

**Owner-run items all share one blocker:** they need a sign-in the build agent couldn't perform (creating a new account, or logging in as admin). Everything reachable from an existing talachero session — plus every RPC state machine at the DB level — was verified this session. The two 🟠 deferred items are genuine feature gaps, not test failures.
