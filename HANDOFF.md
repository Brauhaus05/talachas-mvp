# Session Handoff — 2026-08-21

> Living session-to-session status: what's live, what's next, and the operational facts the code + git log don't capture. Read alongside [CLAUDE.md](./CLAUDE.md) (architecture), [prd.md](./prd.md), [plan.md](./plan.md).
>
> Per-phase build narratives and per-PR verification logs were trimmed on 2026-07-22 — recover them from git history (`git log -- HANDOFF.md`) or the `docs/superpowers/` specs/plans if needed.

---

## Status at a glance

**The app is DEPLOYED and live** at **https://talachas-mvp.vercel.app** (Stripe **test** mode, seed talacheros). Auto-deploys from `main`.

- **All 11 PRD in-scope features are code-complete and merged** (auth, profiles, KYC/Connect, search, availability, booking+concurrency, payments/commission/tips, chat, email, reviews, admin panel + disputes). Phases 0–6 (cycles 1–3) on `main`.
- **Sprint 2 "Autoservicio de prestadores" is complete and merged:** talachero self-service **profile editor** (#18), **availability editor** (#19), **onboarding with admin-review gate** (#21), **earnings/payment-history view** (#22), and a **manual QA runbook** (#23, `docs/qa/2026-07-22-self-service-provider-qa-runbook.md`). All self-service migrations pushed to cloud.
- **Full Stripe payment chain exercised live** (2026-07-11): onboard → book → authorize (manual-capture hold) → accept → capture → 15% split → ledger, both webhooks delivered to Vercel. Refund/tip mechanics proven in test mode.
- **Live QA pass + E2E payment re-verified (2026-07-24):** full visual audit (client/admin/talachero, desktop + mobile) and a fresh live "reservar y pagar" E2E — book → authorize → accept → capture → 15% ledger split, all correct (Neto CA$476, comisión CA$84). ~15 findings logged to the Notion board (`✅ Tareas`); quick-win fixes + a **mobile nav menu** shipped in **PR #24**, now **merged to `main` (2026-08-19)** and live in production. Carlos is Stripe-active on the **cloud** DB, so E2E tests can book him directly (no re-onboarding).
- **Disputes ↔ bookings reconciliation shipped (2026-08-19, PR #25):** the two admin surfaces now
  agree about a booking's payment state, and a resolved dispute reaches the client with a terminal
  state. Migration live on cloud; app deployed. Browser QA still owner-run — see below.
- **Design-system Phase 1 is MERGED and LIVE (2026-08-21, PR #26 → `958081c`):** the grayscale
  foundation is gone; production now renders the JALO palette (bone/ink/magenta, zero radius, hard
  offset shadows, Jost + Barlow). Re-skin only — no payments, RPC, RLS or routing touched, confirmed
  by file list. Squash-merged (matching every prior PR on `main`), CI + Vercel green, deployed.
- **PR #26 was reconciled against the real DS before merging (2026-08-20):** the DS repo **is** on
  this machine; Phase 1 had reconstructed the palette from Notion prose believing otherwise. All ten
  DS-sourced tokens match `src/tokens/source.json` exactly. Braulio decided the two open questions
  against rendered evidence: **borders are ink** with hard offset shadows, and
  **`--jalo-magenta-lift` is dropped** for the DS press model. See the section below.
- **Merge verified against production, not just against a green deploy** (the §7 rule, and the
  Turbopack stale-CSS gotcha, both say a passing build is not evidence): the stylesheet served from
  `talachas-mvp.vercel.app` was fetched and grepped — all ten DS hexes present and exact
  (`ink-muted #5f595a`, `star #ac7223` included), every emitted `--radius-*` at `0`, the only
  non-zero `border-radius` being Avatar's legitimate circle, and `--jalo-magenta-lift` /
  `--color-action-primary-hover` / `--jalo-identity-*` absent as intended. The `<html>` tag carries
  both the Jost and Barlow font variables.

The core loop is real end-to-end: discover → book (concurrency-safe slot) → pay (Stripe escrow) → chat → accept → complete → capture + 15% split → tip → refund → review → dispute (admin-mediated), with an immutable `transactions` ledger.

---

## 🚨 Production blocker (business/legal, not code)

**The platform Stripe account must be a Mexico entity before onboarding any real talachero.** Talachas collects a 15% `application_fee_amount` from MX talacheros via destination charges; Stripe only allows this when platform + connected accounts are in the **same region**, and cross-border Connect is **US/UK/EEA/CA/CH only — MX is excluded** ([Stripe won't change this](https://docs.stripe.com/connect/cross-border-payouts)). The current test platform ("Brauhaus Studio", `acct_1CQr1k…`) is **Canadian** — real payouts to MX talacheros are impossible on it.

**Fix:** provision a MX legal entity + MX bank Stripe account, point `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` at it, and unset `STRIPE_CONNECT_COUNTRY` (defaults to `MX`) + `NEXT_PUBLIC_CURRENCY` (the CA/CAD values are test-platform workarounds — see below).

---

## What's next

**▶ Next session: owner-run browser QA of the disputes reconciliation.** The work is **merged
(PR #25, `6fcfa6e`), deployed, and the migration is live on cloud** — see below. What remains is
the three browser flows, which need a signed-in session plus a running `stripe listen`. They are
the only unverified part of this change.

**▶ PR #26 is merged — what it leaves behind is a production visual audit, not a merge.** Phase 1 is
on `main` (`958081c`) and live. Two things are now owed and neither is code:

1. **Look at production.** The Notion task _"Auditoría visual completa del MVP en producción"_ is the
   one that closes this. The seven Phase-1 board tasks were left in `En revisión` rather than
   `Hecho` for exactly this reason — same convention the PR #24 fixes follow. The three tasks
   literally named `PR #26 ·` **were** moved to `Hecho`: they were decisions that blocked the merge,
   and the merge happened.
2. **The three surfaces the seed cannot reach** — chat own-message bubbles, availability grid cell
   states, and `/dashboard/bookings/[id]/{dispute,review}`. Tracked as _"Fase 2 · Verificar las 3
   superficies que el seed no alcanza"_. These shipped **unseen**; contrast is arithmetic there, not
   observed.

**▶ Board drift worth a minute, found while syncing.** Three tasks the PR #25 section below
describes as closed are still `Por hacer` on the board: _"Reconciliar disputas ↔ reservas"_,
_"Estado de pago 'captured' sin traducir en admin"_ and _"Disputa descartada muestra 'Reporte en
revisión' para siempre"_. Left untouched rather than moved unilaterally — confirm they are in fact
closed, then move them.

**▶ Owed to the DS repo, and deliberately NOT done from here.** Three follow-ups came out of the
reconcile and are tracked on the Notion board as their own `DS ·` tasks. Do them in **one** DS
session, not three: all three end up touching `conventions.md` or its consumer docs, and each
otherwise owes its own `contact-sheet` + `/design-sync` + `-NOTES.md` ritual.

1. **`conventions.md` doesn't state the star exemption's precondition** (P1, XS). The colour table
   lists `--jalo-star` with no caveat, while `contrast.test.ts` is explicit that 3:1 only holds
   because the numeric value renders beside an `aria-hidden` glyph. That file is inlined into the
   design agent's prompt and the agent never sees the test, so it can emit a bare star at 3.07:1
   carrying the rating alone.
2. **No interactive star input exists in the DS** (P2, M) — `rating-input.tsx` stays local and ink.
3. **Consumer note: Tailwind v4 tree-shakes `@theme` vars with no consumer** (P2, XS).

After that, the remaining board items are the deferred features listed at the bottom (tiered
refunds, 24h reminder email, neighborhood picker, photo upload).

### Phase 1 reconcile against the real DS (2026-08-20 — PR #26, since **merged** as `958081c`)

**The DS repo IS on this machine.** The section below was written believing it was not, and that
belief is the only reason the palette had to be reconstructed from Notion prose. It lives at
`~/Documents/Claude/Projects/001 HQ Lobby/Jump After Us/02 Projects/JALO/Jalo Design System/`.
Read these four, in order, before touching anything design-related:
`src/tokens/source.json` (the ONLY authority on hexes) · `.design-sync/conventions.md` (the rules,
including that borders are ink) · `src/tokens/contrast.test.ts` (the asserted pairings and why each
exists) · `HANDOFF.md` §6 (working rules + the palette-model incident).

The reconstruction got **8 of 9 published hexes exactly right**. Reconciled in two commits:

- **`--jalo-ink-muted` `#6B5F61` → `#5F595A`.** The claim below — that a lighter DS value would fail
  AA and mean revisiting the ramp — is **backwards**. `#5F595A` is _darker_ and improves every
  ratio (bone 4.63→5.19, paper 6.11→6.86). More importantly the old value was **already failing**:
  4.41:1 on `--jalo-chip-strong`, one of this app's own invented surfaces, which the DS's suite
  could never have caught. One-line swap, as the code comment always said.
- **`--jalo-star` `#AC7223` added.** Rating glyphs rendered in ink before. Wired via a
  `--color-rating-star` semantic to the glyph _only_ — the numeric value beside it stays
  `--color-text-primary`. The DS asserts stars at the **3:1 graphical** floor, and per
  `contrast.test.ts` that exemption is **conditional** on the numeric value always rendering beside
  an `aria-hidden` glyph. Verified that holds here before relying on it. Deliberately NOT applied to
  the rating filter chips (star on the selected magenta fill is **1.22:1**), the profile-form
  "set primary" star (means primary, not rating), or `rating-input` (the star IS the sole carrier
  there, so the exemption does not hold).
- **Borders `#83786F` → `--jalo-ink`.** Braulio's call, made against a rendered A/B of a real
  `TalacheroCard`. The invented border passed 3:1, which is exactly why nothing caught it — the
  failure mode the DS's own `HANDOFF.md` §6 records. Raised surfaces now carry a hard offset shadow;
  `--shadow-hard-accent` (magenta 6px) is the DS's interactive-card hover.
- **`--jalo-magenta-lift` `#FF5C90` dropped.** An invented brand hex. DS `Button.css` gives primary
  **no** `:hover` at all and the DS contains zero colour-lighten; feedback is geometric. Replaced
  `active:scale-[0.98]` with the real press model (shadow → `0 0 0`, translate by the offset, 60ms,
  reduced-motion guarded). This also fixed hover and press rendering identically.
- **Identity tints NOT added — Phase 2 carries them.** Reasoning in `globals.css`. Load-bearing
  finding: **Tailwind v4 tree-shakes `@theme` variables nothing references**, so declaring
  `--jalo-identity-1..4` without a consumer emits _nothing_ — verified against a clean build, the
  names are absent from the output CSS. A placeholder that silently does not exist is worse than
  none.

**⚠ Owed to the DS repo — do NOT make these here.** A change there owes a `conventions.md` update
and a `/design-sync` run in the same session:

1. **`conventions.md` states the star's role but not its precondition.** The table says
   "`--jalo-star` | star rating glyphs" with no caveat, while `contrast.test.ts` is explicit that
   3:1 only holds because `StarRating` renders the numeric value beside an `aria-hidden` glyph.
   `conventions.md` is inlined into the design agent's prompt and that agent never sees the test —
   so it can emit a bare star at 3.07:1 carrying the rating alone. Add the precondition.
2. **The DS has no interactive star input.** `ui/rating-input.tsx` is a 1–5 selector where the star
   is the sole carrier with no numeric value, so the display exemption does not transfer. It stays
   local and ink. The DS should either gain the component or document its position.
3. **Consumer note: Tailwind v4 tree-shaking** (above). Any app mirroring the palette into `@theme`
   will hit it. Worth a line in the DS's consumer docs.
4. **No `ALLOWED_DEVIATIONS` entry is owed.** Soft borders were the alternative and were rejected,
   so nothing diverges. Recorded so it is not re-proposed: `magenta-lift` was likewise considered
   and dropped rather than pushed upstream.

**Verified this session:** typecheck + lint + build clean; 15 route/locale/width combinations swept
at 1280 and 390 including authenticated client and talachero dashboards; press and hover states read
back off the live DOM rather than assumed. Horizontal overflow measured at 320/390/1280 on every
route is **byte-for-byte identical to `0ad8cb5`** — this work introduces none, but the pre-existing
overflow is real and belongs to the Phase 4 audit.

**Notion board (`✅ Tareas`) reconciled the same day.** The board is the tracker of record, so its
state is the answer to "what is left", not this file. As of close of session:

- **Moved to `En revisión`** (the board's convention for _shipped in a PR, not yet verified_ — the
  PR #24 fixes sit there too): the three tasks literally named **`PR #26 ·`** (reconcile, the border
  decision, `magenta-lift`), plus **`Fase 1 · Cambio de fundación`**, **`Fase 1b · Radios y
sombras`**, **`App · Botones primarios texto ink`** and **`Tipografía · Futura/Jost`**.
  **Updated on merge (2026-08-21):** the three `PR #26 ·` tasks are now **`Hecho`** — each was a
  decision gating the merge, and the merge happened. The other four stay **`En revisión`**: they are
  visual outcomes, and the board's bar for `Hecho` is a look at production, which the standing
  _"Auditoría visual completa"_ task still owns. Every one of the seven notes said "pendiente de
  merge"; all seven were rewritten to say what actually shipped and where it was verified.
- **Two errors corrected inside the `Fase 1` task note itself**, since wrong notes are what caused
  this detour: it said _"Inter por Anton + Barlow"_ (the live decision is **Jost**) and _"los 5
  `--radius-`"_ (there are **six**; `--radius-3xl` was the straggler). That task now also warns that
  its palette values are not the source of truth — `source.json` is.
- **Three new `DS ·` tasks created** for the follow-ups above, so a DS session can pick them up
  independently. The `DS · Correr contact-sheet y design-sync` task points at them by name instead
  of restating them.
- **Deliberately not a task:** _no `ALLOWED_DEVIATIONS` entry is owed._ Soft borders and
  `magenta-lift` were the two candidate deviations and **both were rejected**, so nothing diverges.
  Recorded as an explicit "nothing to do" note so it isn't re-litigated next session.
- **Pre-existing horizontal overflow logged** to `Auditoría visual completa del MVP en producción`
  with per-route numbers (`/talacheros/[id]` is worst at 459px against a 390px viewport) and the
  evidence that it predates this branch. Same task carries the one real half-state this work left:
  the talachero dashboard's section panels are loose `div`s rather than `Card`, so they took the ink
  border but not the elevation. That's inside the 13 out-of-scope routes (`DESIGN-SYSTEM.md` §8),
  which is why it was logged rather than expanded into.

---

### Phase 1 — JALO design foundation (PR #26 — MERGED 2026-08-21 as `958081c`, deployed)

> ⚠ Superseded in part by the reconcile above. Kept for the reasoning, not the values.

First phase of the `@jalo/design-system` migration described in `DESIGN-SYSTEM.md`. Six commits on
`phase-1-jalo-foundation`. Deliberately a re-skin: `actions.ts`, the Stripe webhook, RPC calls and
RLS behaviour are untouched.

**The palette had to be recovered, and that is the load-bearing fact here.**
`@jalo/design-system` is **not installed** and the DS repo was believed absent — **that was wrong,
see the reconcile above**; the companion docs `JALO-DS-Migration-Strategy.md` /
`JALO-DS-Gap-Analysis.md` are also absent. `DESIGN-SYSTEM.md` publishes only 4 hexes. The rest came
from the Notion page **"🧱 Design System v1 — componentes core y tokens"** (JALO → 005 UX/UI
Project Management) and were confirmed by reproducing every contrast ratio the doc publishes:
ink on magenta **5.067** (doc 5.07), magenta on bone **2.512** (2.51), ink on tag-blue **4.654**
(4.65), white on magenta **3.317** (3.32). Four independent exact matches — treat the palette in
`globals.css` as confirmed.

- bone `#E8DFD1` · paper `#FFFFFF` · ink `#241B1D` · magenta `#FF427E` (fill, **ink** label — white
  is 3.32:1 and fails) · magenta-ink `#B81E5E` (text + every focus ring) · highlight `#FFC211` ·
  tag-blue `#4D89D1`.
- ~~**`--jalo-ink-muted` `#6B5F61` is DERIVED**~~ — **RESOLVED and this reasoning was wrong.** The
  DS value `#5F595A` is _darker_, not lighter; it improves every ratio and required no ramp rethink.
  The derived value was failing AA at 4.41:1 on `--jalo-chip-strong`. See the reconcile above.
- Raw `--jalo-*` names sit **outside** Tailwind's `--color-*` namespace on purpose: they generate no
  utilities, so nothing in markup can reach past a semantic token to a brand colour.

**Also in the PR:** all six `--radius-*` at `0` (incl. the `--radius-3xl` this app never declared —
without it the two `rounded-3xl` panels stay round); a separate provably-inert commit removing 63
now-dead `rounded-*` classes; and a **`destructive` button variant**, because making primary magenta
had turned `/admin/users` into 27 identical hot-pink "Bloquear" buttons. `ConfirmButton`'s `tone` is
now semantic (`danger | primary | neutral`) rather than the emphasis dial it used to be.

`DESIGN-SYSTEM.md` is now tracked **and auto-loaded** via `@DESIGN-SYSTEM.md` in `CLAUDE.md`, so its
rules are in context every session. Three self-contradictions were corrected against what shipped
(§1.9 said Anton where §4 resolves to Jost; Phase 1's prompt said "five `--radius-*`" where six are
required; and it said "do not modify any component file" directly above four bullets instructing
component edits).

**Verified:** 34 contrast pairings arithmetically (worst text 4.63:1, worst UI 3.26:1) · **21/21 UI
routes rendered** at 1440px and 390px in both locales across client/talachero/admin · all six
`DESIGN-SYSTEM.md` §6 non-regressions · typecheck + lint (2 pre-existing warnings) + build clean ·
the class sweep is pixel-identical on all 10 sampled routes and verified token-by-token.

**⚠ Not verified — needs a reviewer's eyes or better seed data:**

1. **Chat own-message bubbles** (`bg-action-primary` + ink) — the seed has **no chat messages**, so
   only the empty state renders. Contrast is 5.07:1 by arithmetic, never by eye.
2. **Availability grid cell states** — Carlos has no open slots in week 1, so every cell renders
   "closed"; open/booked/closed were never seen side by side.
3. **`/dashboard/bookings/[id]/{dispute,review}`** are unreachable with current seed data — every
   completed booking already has a review, and the only `captured` booking already has a dispute.
   They were captured by temporarily deleting those two rows and restoring them (rows verified
   byte-identical afterwards, and Carlos's `rating_avg/rating_count` rollup back at `4.75 / 4` —
   `reviews` has an `AFTER INSERT/DELETE` trigger, so any repeat of this must re-check that).

**Gotchas worth keeping (both cost real time):**

- **Turbopack serves stale CSS after `@theme` edits.** Two full screenshot sweeps were captured
  against old tokens and looked like the change had failed. `rm -rf .next` + restart, and _guard_
  before believing a screenshot: fetch the linked stylesheet and grep it for a token you just added.
- **Headless Chrome `--window-size` does not drive the layout viewport** — `md:` breakpoints still
  applied at 390px, so "mobile" shots were desktop and the hamburger appeared missing. Use
  `pnpm dlx playwright@1.49.1 screenshot --channel=chrome --viewport-size=390,844`; the cached
  `ms-playwright` chromium is a version mismatch, so `--channel=chrome` is the part that works.

**▶ Phase 2 is blocked externally, not by anything in this repo.** It replaces `src/components/ui/*`
with DS equivalents, which needs (a) `pnpm add @jalo/design-system` against the private GitHub
Packages registry — see `DESIGN-SYSTEM.md` §2 — plus (b) DS Phase 0.2 (`linkComponent`, or raw `<a>`
drops the locale prefix) and (c) the missing `"use client"` directives on the eight client-only DS
components. Check `node_modules/@jalo` exists before promising Phase 2 work.

### Disputes ↔ bookings reconciliation (2026-08-19 — merged PR #25, deployed, cloud migrated)

Closes the Sprint 3 P1/P2 dispute rows. The two admin surfaces now agree, and a resolved dispute
reaches the client.

- `get_my_bookings` returns **`dispute_status`** (enum) instead of the boolean `has_dispute`;
  one-time backfill closes disputes whose booking was already refunded out-of-band.
- `refundBookingIfCaptured` returns a discriminated **`RefundOutcome`** instead of `boolean`.
  Splitting `already_refunded` out of the old `false` is the whole fix — that conflation is why
  the disputes-queue "Reembolsar" button silently did nothing.
- `forceRefund` closes an open dispute after a successful refund (best-effort, sequenced _after_
  the refund so a dispute-write failure can never strand money). `resolveDispute` records
  `refunded` on both `refunded` and `already_refunded`.
- Admin disputes table gains **payment-status + resolved-date** columns; both admin tables now use
  a shared **translated** payment badge (closes the "raw `captured` label" finding).
- Client card shows a terminal state: `open` → "Reporte en revisión", `refunded` → "Reporte
  resuelto — reembolsado", `dismissed` → "Reporte revisado". The block is no longer gated on
  `payment_status = 'captured'`, which is why a refunded dispute previously vanished entirely.
- New **dismissal email** (`notifyDisputeDismissed`). The refund path deliberately sends none —
  `notifyRefundIssued` already fires from `charge.refunded`.

**Corrections to the earlier framing in this file:** there was never a real double-refund risk —
`admin_list_bookings` filters on `payment_status = 'captured'` and `refundBookingIfCaptured`
re-reads before calling Stripe. The actual defect was that an out-of-band refund left the dispute
with _no correct terminal state_. And the client side was worse than recorded: a **refunded**
dispute showed the client nothing at all, not merely a stale label.

**Verified:** `pnpm typecheck` + `pnpm lint` (2 pre-existing warnings only) + `pnpm build` clean;
es/en keys 431/431; migration applied via `migration up --local`; backfill leaves 0 stuck rows and
re-runs as `UPDATE 0` (idempotent).

**⚠ Still owner-run — needs a browser + `stripe listen`:**

1. Raise a dispute as `mariana.ruiz@demo.talachas.mx` → force-refund that booking from
   `/admin/bookings` → the dispute should self-close as `Reembolsada` with a resolved date, and
   Mariana's card should read "Reporte resuelto — reembolsado".
2. Raise a dispute → **Descartar** → card reads "Reporte revisado" (not "en revisión"), and the
   dismissal email arrives (set `EMAIL_DEV_REDIRECT` to a real inbox).
3. The previously-broken case: mark a booking with an open dispute as refunded directly in the DB,
   then click **Reembolsar** in the disputes queue — it must now close the dispute (the
   `already_refunded` branch) instead of reloading unchanged.

**Cloud push: DONE (2026-08-19).** `supabase db push` on the pooler `--db-url` applied
`20260819120001_dispute_reconciliation.sql` to `rcpfxcwooptmadyacfkk`. Verified on the cloud DB
afterwards: `get_my_bookings` has 13 OUT columns with `dispute_status` present, `has_dispute` gone,
`LIMIT 1` live, and **0 stuck disputes**. **The backfill was a no-op in production** — both live
disputes are `open` on `captured` bookings, so nothing had been stranded by the old bug. The repair
path exists for when it's needed; it simply had nothing to fix.

**⚠ Deploy ordering matters if this pattern repeats.** The migration drops `has_dispute` from the
RPC, so DB and app code are one atomic unit. Pushing the migration while the app still reads
`has_dispute` shows a live "report a problem" button to clients who already have a dispute (submit
then fails `already_disputed`). Deploying the app _first_ is worse — `disputeStatus` reads
`undefined`, `undefined !== null` is true, and the dispute form 404s for **everyone**. The order
used here was: push migration → merge immediately → Vercel redeploys (~40s window of the milder
state). A zero-downtime version would ship both columns first, deploy, then drop the old one in a
second migration.

**Verification / QA:**

- ✅ **Live "reservar y pagar" E2E** (2026-07-24) — re-verified on the deployed site (book → authorize → accept → capture → 15% split; both webhooks delivered). Cloud DB now has one extra test booking (24 jul, Mariana↔Carlos, CA$560 captured).
- ✅ **Browser passes done** (2026-07-24): landing, catálogo, profile, reviews, booking flow, client dashboard, admin (all surfaces), disputes, talachero dashboard/earnings/availability/profile — desktop + mobile. Findings → Notion `✅ Tareas` board; UI fixes in PR #24 (merged). Sign-ins: `mariana.ruiz@demo.talachas.mx` (client), `carlos.mendoza@demo.talachas.mx` (talachero), `admin@talachas.mx` (admin) — all `password123`.
- Still owner-run: the **self-service QA runbook** (`docs/qa/2026-07-22-self-service-provider-qa-runbook.md`) — new-talachero signup → onboarding checklist → submit-for-review → admin approve/reject, profile/availability/earnings. Carlos is left `in_review` on the **local** DB to prime the queue (cloud has no pending verifications).

**Small follow-ups (non-blocking, logged from reviews):**

- _**PR #24 merged 2026-08-19** (squashed as `9947303`; branch `qa/sprint3-quick-fixes` deleted; production deploy Ready on `talachas-mvp.vercel.app`). Shipped: landing review-count dup, review-card rating display, "Desde ⋯" filter labels, tip-hidden-on-refunded, and the mobile nav menu. Remaining open findings (incl. the two dispute items below) are tracked as rows on the Notion `✅ Tareas` board._
- **`verified` no longer implies _payable_** (onboarding decoupled Stripe from verification) — an admin can approve a talachero before Stripe is done, so a listed talachero may return `talachero_not_payable` until they finish Stripe. Accepted "Stripe is parallel" decision; admin queue shows a `payments_ready/pending` badge. Optional tightening: also filter `list_talacheros` on `charges_enabled`.
- Panel task optional extras (owner to close-vs-split): consolidated message inbox, availability date-blocks.
- Dead code cleanup: `PlaceholderPanel` + `dashboard.coming_soon` key (last consumer removed).

**Deferred features:**

- **Cancellation-policy tiers** — partial/tiered refunds so `refundBookingIfCaptured`/`refundCapturedBooking` take an amount (today all refunds are **full**). ~1 day.
- **24h reminder email** — needs a scheduler/cron. Optional dispute acknowledge/dismiss + admin new-dispute-alert emails.
- **Neighborhood picker + `ST_DWithin` search** — directory RPCs (`list_talacheros`) are the seam; lands when a location input appears in search.
- **Photo upload + coverage-zone editor** — deferred from the profile editor (their own tracker rows).

---

## Live deployment — access & config

- **Vercel:** project `talachas-mvp` (scope `brauhaus05s-projects`, `prj_AReXIRBLwKuZuRDMCRNvAlZje2ct`), auto-deploys from `Brauhaus05/talachas-mvp` `main`. Prod alias `talachas-mvp.vercel.app` (== `NEXT_PUBLIC_APP_URL`, so Stripe return/success URLs resolve).
- **Cloud Supabase:** project `talachas-mvp`, ref **`rcpfxcwooptmadyacfkk`** (org `wkuavigarfybmuwlqidp`, East US / N. Virginia). All migrations + seed loaded (10 demo talacheros). Email confirmation **disabled** (immediate session, no SMTP). **DB password lives only in the owner's password manager / Supabase dashboard.**
  **⚠ ACTION PENDING (2026-08-19): rotate it.** It was pasted in plaintext into a terminal during
  the cloud push, so it now sits in shell history on disk. Reset under Settings → Database, then
  update the password manager. Pass it via an env var rather than inline next time.
  - **Cloud schema pushes: `supabase db push`, NEVER `db reset --linked`** (a reset wipes talachero Stripe onboarding). Use the **pooler `--db-url`** (`...pooler.supabase.com...`, us-east-1, session pooler `:5432`) — the direct `db.<ref>` host is IPv6-only and times out on most networks. Owner runs it (password is theirs).
- **Stripe:** TEST mode, Canadian platform account. Webhook **`we_1Ts4wlEkZnbeTZfTVDMMBPbd`** → `https://talachas-mvp.vercel.app/api/stripe/webhook` (6 events: `checkout.session.completed/expired`, `payment_intent.succeeded/canceled`, `charge.refunded`, `account.updated`).
- **Vercel prod env vars (Production scope):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY` (test), `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`, `PLATFORM_FEE_PCT=0.15`, `STRIPE_CONNECT_COUNTRY=CA`, `NEXT_PUBLIC_CURRENCY=CAD`, `RESEND_API_KEY`. (Add Preview/Development if you want branch previews to work.)

### ▶ Simulate a payment on the live site (owner runbook)

Seed talacheros aren't Stripe-onboarded, and `confirmBooking` returns `talachero_not_payable` until `charges_enabled`. So:

1. Sign in as `carlos.mendoza@demo.talachas.mx` → talachero dashboard → **Configurar pagos** → complete Stripe Express **test** onboarding. Panel flips to **Activos** on return.
2. Incognito: sign up a new client (or sign in `mariana.ruiz@demo.talachas.mx`) → open Carlos's profile → pick a slot → **Confirmar reserva** → pay with test card **`4242 4242 4242 4242`** (any future expiry + CVC).
3. Booking shows **Pago autorizado**. Sign in as Carlos → **Aceptar** → **Marcar completada** (captures). Ledger rows land via the webhook.

---

## Local dev setup

```bash
open -a Docker
pnpm exec supabase start           # local stack (ports remapped +1000 — see below)
pnpm exec supabase db reset        # apply migrations + seed (DESTRUCTIVE — see gotcha)
# copy API URL + Publishable/Secret keys from `supabase status` into .env.local
pnpm dev                           # :3000
```

- **Ports remapped +1000** (`config.toml`: api 55321, db 55322, studio 55323) to coexist with another local Supabase stack on the default 543xx ports. `.env.local` points at `:55321` (NOT the `54321` in `.env.example`).
- CLI issues **new-format keys** (`sb_publishable_…` / `sb_secret_…`); `@supabase/ssr` accepts the publishable key in the anon slot.
- `.env.local` has **`STRIPE_CONNECT_COUNTRY=CA` + `NEXT_PUBLIC_CURRENCY=CAD`** (workarounds so the Canadian test platform can charge + pay connected accounts). Unset both for real MX production.
- **Use `migration up`, not `db reset`, once a talachero is onboarded** — the seed doesn't set Stripe fields, so a reset wipes onboarding (`stripe_account_id`, `charges_enabled`). `supabase migration up --local` applies new migrations non-destructively; only reset for a deliberately clean seed.
- After any schema change, regenerate types: `pnpm exec supabase gen types typescript --local > src/lib/supabase/database.types.ts` (then add aliases to the hand-maintained `types.ts`).
- **Seed accounts** (all `password123`): talachero `carlos.mendoza@demo.talachas.mx`, client `mariana.ruiz@demo.talachas.mx`, admin `admin@talachas.mx`. Seed addresses (`*.demo.talachas.mx`) are non-deliverable — set `EMAIL_DEV_REDIRECT` to a real inbox to test email.

**Verification** (no test runner): `pnpm typecheck` + `pnpm lint` + `pnpm build` clean, plus manually exercising flows.
**Design constraints:** grayscale only (tokens, never hex/rgb; state via icon+text). Every visible string through `t()`; keep `messages/es.json` and `messages/en.json` in sync (a `node -e` key diff catches drift). **Prettier drift:** committed Phase 1 files don't match current prettier output — format only files you touched.

---

## Stack + decisions confirmed

- Frontend/hosting: Next.js 16 on Vercel · DB/auth/storage/realtime: Supabase · Payments: Stripe Connect (Express).
- **Currency: app is now all-CAD** — `getCurrency()` defaults to `CAD`, `getConnectCountry()` to `CA` (env overrides still work). `formatMoney` pins the number-locale to `en-MX` so the symbol renders as **`CA$`** in both locales. `NEXT_PUBLIC_CURRENCY` drives both the Stripe charge currency and the display formatter. This is a **currency** change, not a geography rename — CDMX geography (city `country_code='MX'`, `es-MX`, timezone) is unchanged. **CA$/CAD display is intentional until further notice.**
- **KYC:** Connect Express hosted onboarding; **admin approval is now the sole path to `verified`** (Stripe decoupled — the `account.updated` webhook only writes `charges_enabled`/`payouts_enabled`).
- **Commission:** 15% via `PLATFORM_FEE_PCT`.
- **Coverage area:** center point + radius (not polygon) for MVP.
- **Slot granularity:** 1 hour; a booking reserves one slot (`hours` is an informational price estimate).
- **Availability editor model:** "direct slot calendar" — talachero opens/closes concrete 1-hour slots on a 14-day week grid (no recurring templates, no cron).

---

## Gotchas (cumulative)

- **`redirect()` + typed routes** — use `redirect` from `next/navigation` (reliably `never`) with `` `/${locale}/…` as Route ``; external URLs (Stripe) also cast `as Route`.
- **Supabase session + next-intl in one proxy pass** — `proxy.ts` runs next-intl to get a `NextResponse`, then attaches Supabase auth cookies to _that same response_. Don't create a second response.
- **RLS recursion** — a policy on `users` querying `users` recurses; use `SECURITY DEFINER` helpers with a pinned `search_path`. All cross-table state transitions go through `SECURITY DEFINER` RPCs validating `auth.uid()` internally.
- **Public projections behind RLS** — display data (talachero name, review author, booking counterparty) sits behind own-row RLS, exposed via `SECURITY DEFINER` functions returning only safe columns.
- **Server-only money writes** — Stripe/verification/money columns are `REVOKE UPDATE … FROM authenticated`; the webhook + onboarding actions write them via the service-role client. `bookings` UPDATE is fully revoked (all mutations go through RPCs). Changing an RPC's OUT columns needs `DROP` then `CREATE` (not `CREATE OR REPLACE`).
- **Concurrency** — `create_booking` locks the slot with `SELECT … FOR UPDATE` before checking status; racing callers serialize, loser gets `slot_unavailable`. A GiST exclusion constraint makes overlapping slots impossible at the DB level.
- **Webhook is the source of truth for payments** — actions trigger Stripe (capture/cancel/refund) best-effort inside `safe()`; booking `payment_status` + the `transactions` ledger are written only by the webhook, idempotently (`stripe_events` PK dedupe). PI metadata `{ booking_id, kind: 'booking' | 'tip' }` routes events. `transactions` is an append-only immutable ledger — balances are always derived.
- **Lazy env config** — `src/lib/{supabase,stripe}/config.ts` expose getter functions, not module constants, so importing has no side effects and `next build` works with no env (CI). Verify builds with `.env.local` moved aside.
- **Only `charges_enabled` talacheros are bookable-with-payment** — seed talacheros must onboard first; `confirmBooking` returns `talachero_not_payable` otherwise. Directory gates on `verification_status='verified'` (now admin-set), independent of payability.
- **Seed runner batching** — `supabase db reset` doesn't preserve session temp tables across statement batches; write seeds as one `DO` block. Seed auth users via `auth.users` insert (fires the signup trigger) + matching `auth.identities` row.
- **Supabase Realtime (chat)** — a table must be in the `supabase_realtime` publication AND the subscriber must pass its RLS `SELECT`. The channel takes ~1s to reach `SUBSCRIBED`; `ChatView` optimistically appends the sent row (deduped by id) so a message sent in that window isn't lost.
- **Email is best-effort and off-by-default (5B)** — `notify*` swallow all errors (never throw into a form action or the webhook); `sendEmail` no-ops when `RESEND_API_KEY` is unset. Payment "processed" = **capture** (completion), not authorize. `EMAIL_DEV_REDIRECT` is hard-ignored in production. Refund email currently shows the full booking price (correct while all refunds are full — thread `charge.amount_refunded` when partial refunds land).
- **`supabase gen types` lies about nullability for function OUT columns** — a `RETURNS TABLE`
  column that can be SQL `NULL` is typed non-nullable in `database.types.ts` (e.g.
  `get_my_bookings.dispute_status`). The hand-written view types in `lib/data/` widen it back
  (`DisputeStatus | null`), so read those, not the generated row type, or you'll trust a
  non-null claim that isn't true.
- **Verifying a function's shape:** query `information_schema.parameters`, NOT
  `information_schema.columns` — `columns` only covers real tables/views/composite types and
  returns 0 rows for any function. `psql` isn't on the host PATH; go through
  `docker exec supabase_db_talachas-mvp psql -U postgres -d postgres`.
- **Auth-aware nav made locale pages dynamic** — `TopNavBar` reads the session, so pages render on demand (all `ƒ`). Expected tradeoff.
- **Turbopack serves stale CSS after `@theme` edits in `globals.css`.** `pnpm dev` keeps serving the
  previous token values — same chunk URL, no rebuild — so screenshots look like nothing changed.
  `pkill -f "next dev" && rm -rf .next`, restart, and **guard before believing a screenshot**: fetch
  the linked stylesheet and grep it for a token you just added.
  `C=$(curl -s localhost:3000/es | grep -oE '/_next/static/[^"]+\.css' | head -1); curl -s "localhost:3000$C" | grep -oE '\-\-radius-md: *[^;}]*'`
- **Headless Chrome `--window-size` does not drive the layout viewport** — `md:` breakpoints still
  apply at 390px, so "mobile" screenshots are really desktop (the hamburger appears missing). Use
  `pnpm dlx playwright@1.49.1 screenshot --channel=chrome --viewport-size=390,844 --full-page`.
  `--channel=chrome` matters: the cached `ms-playwright` chromium is a version mismatch. For
  authenticated routes, `npm i playwright` **into the scratchpad** (not the project) and drive the
  sign-in form; seed logins are in the QA section above, all `password123`.
