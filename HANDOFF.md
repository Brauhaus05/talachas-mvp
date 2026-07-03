# Session Handoff — 2026-07-02

> Read this alongside [prd.md](./prd.md) and [plan.md](./plan.md). This doc captures what the code and git log **don't** — session decisions, open questions, and where to pick up.

## Where we are

**Phase 0 ✅ Foundation** — commit `f9b0321`
Next.js 16 + React 19 + Tailwind v4 + Turbopack. Grayscale-only design tokens in `src/app/globals.css`. Custom primitives (no shadcn CLI — its default palette adds no value in a grayscale-only design). next-intl 4.13 with `es` (default) + `en`. Prettier + husky + lint-staged + GitHub Actions CI (typecheck → lint → build).

**Phase 1 ✅ Clickable demo (5 Figma screens + mock data)** — commit `843107f`
All routes ship both locales. 66 static pages, checkout is dynamic (reads searchParams).

| Route                                 | What                                                                  |
| ------------------------------------- | --------------------------------------------------------------------- |
| `/{es,en}`                            | Hero + Servicios Populares bento                                      |
| `/{es,en}/talacheros`                 | Filter sidebar + card grid, client-side filtering/sort                |
| `/{es,en}/talacheros/[id]`            | Profile: hero, services, About, reviews, sticky booking rail          |
| `/{es,en}/book/[talacheroId]`         | react-hook-form + zod, 6 fields                                       |
| `/{es,en}/book/[talacheroId]/summary` | Order summary, tip selector, 15% platform fee, Confirm → success view |

Phase 0 + Phase 1 are committed on `main`. Phase 2 work (this session) is **uncommitted** in the working tree.

**Phase 2 ✅ Data model + Auth** — (uncommitted as of this handoff)
Full PRD §7 schema live in local Supabase, Supabase Auth for both roles, RLS, role-gated dashboards. All exit criteria verified end-to-end (see below).

**Phase 3 (next) — Search, profile, booking (real data)** ~3–5 days
Replace `src/lib/mock/` with Supabase queries behind the existing Figma screens. See [plan.md](./plan.md) §Phase 3.

---

## Phase 2 — what shipped

**Migrations** (`supabase/migrations/`, applied cleanly via `supabase db reset`):

1. `…140001_extensions_enums_reference` — postgis + btree_gist; 5 enums; `cities` (CDMX seeded: MXN / es-MX / America/Mexico_City) + `service_categories` (8 rows, slugs match `mock/services.ts`).
2. `…140002_users_profiles` — `users` (extends `auth.users`), `handle_new_user` signup trigger (reads role from metadata, creates a `talachero_profiles` shell for talacheros), `talachero_profiles` (**coverage = `center_point geography(Point)` + `radius_meters`**, radius-for-MVP decision), `talachero_services` join table.
3. `…140003_bookings_chat_reviews` — `availability_slots` (**GiST exclusion constraint blocks overlaps** → no double-booking), `bookings`, `transactions` (append-only ledger), `chat_threads`/`chat_messages`, `reviews` (unique per booking+author).
4. `…140004_rls_policies` — RLS on all 11 tables. Helpers `is_admin()` / `owns_talachero()` / `is_booking_participant()` are `SECURITY DEFINER` to avoid policy recursion. Role self-escalation blocked via column-level `REVOKE UPDATE` on `users.role`; ledger `UPDATE/DELETE` revoked.

**App wiring**

- `src/lib/supabase/{client,server,middleware,config,types}.ts` — `@supabase/ssr`. `types.ts` is hand-authored; regenerate with `supabase gen types typescript --local`.
- `src/proxy.ts` — chains next-intl routing **and** Supabase session refresh in one pass (attach cookies to the intl response), plus an optimistic `/dashboard/*` guard.
- `src/lib/auth.ts` — `getAppUser()` (authoritative role check) + `dashboardPathForRole()`.
- Auth UI: `[locale]/auth/{sign-in,sign-up,callback}` with server actions in `auth/actions.ts`. Sign-up has the role picker (Necesito ayuda / Quiero ofrecer servicios). Email+password (OTP deferred).
- Dashboards: `[locale]/dashboard` (client), `/dashboard/talachero`, `/dashboard/admin` — layout gates auth, each page gates role.
- `TopNavBar` is now auth-aware (Mi panel / Cerrar sesión vs login/signup).

**Verified** (`typecheck`, `lint`, `build` all clean):

- Trigger: client→role client (no profile); talachero→role talachero + pending profile shell. ✅
- **RLS smoke test**: booking owned by client A → owner sees 1, talachero party sees 1, **stranger client B sees 0, anon sees 0**. ✅
- Role self-promotion to admin → HTTP 403. Ledger DELETE → 403. Slot overlap insert → constraint violation. ✅
- Browser: talachero signs in → `/dashboard/talachero`; client signs in → `/dashboard`; talachero hitting `/dashboard/admin` → bounced to `/dashboard/talachero`. ✅

---

## Stack choices confirmed this session

- **Frontend + hosting:** Next.js on Vercel
- **DB + auth + storage + realtime:** Supabase
- **Payments:** Stripe Connect
- **KYC:** Stripe Identity (revisit if MX coverage is insufficient)
- **Chat provider (Phase 5):** default to Supabase Realtime; revisit Sendbird/Twilio at scale
- **First milestone:** clickable demo of the 5 Figma screens with mock data — **done**

---

## Open decisions to resolve before Phase 3

From plan.md §"Open questions" — none block Phase 2 but they should be answered before search/booking touch real data:

1. **Coverage area UX** — polygon draw vs radius. Recommended: radius for MVP.
2. **Commission %** — Phase 1 hardcoded 15%. Needs a business call; make it env-config in Phase 4.
3. **Cancellation policy windows** — refund tiers by time-to-slot. Needs numbers.
4. **Slot granularity** — 1h / 30min / talachero-defined. Recommended: 1h.
5. **Chat provider decision** — commit to Supabase Realtime for MVP or invest in Sendbird now.

---

## Local dev setup (run this to bring the stack up)

```
open -a Docker                    # daemon must be running
pnpm exec supabase start          # local stack
pnpm exec supabase db reset       # apply migrations + seed reference data
# copy API URL + Publishable/Secret keys from `supabase status` into .env.local
pnpm dev                          # :3000
```

- **Ports are remapped +1000** (`supabase/config.toml`: api 55321, db 55322, studio 55323, …) so this stack coexists with another local Supabase project that already owns the default 543xx ports. `.env.local` points at `:55321`.
- This CLI issues **new-format keys** (`sb_publishable_…` / `sb_secret_…`), not legacy anon/service_role JWTs. `NEXT_PUBLIC_SUPABASE_ANON_KEY` holds the publishable key; `@supabase/ssr` accepts it as a drop-in.
- `.env.local` is gitignored; `.env.example` is committed. **No cloud project is linked yet** — do `supabase link --project-ref <ref>` when ready to deploy.

Test users seeded during verification: `client@test.com`, `talachero@test.com`, `client2@test.com` — all password `password123`.

---

## Codebase quick reference

**Paths worth knowing:**

- `src/app/[locale]/` — all routes; locale is required on every path
- `src/i18n/{routing,navigation,request}.ts` — next-intl wiring (do not hardcode locale)
- `src/proxy.ts` — Next 16 renamed middleware → proxy; locale routing lives here
- `src/lib/mock/` — Phase 1 fake data; Phase 3 will replace with Supabase queries
- `messages/{es,en}.json` — full i18n catalogs, keep in sync
- `src/app/globals.css` — grayscale tokens via Tailwind v4 `@theme`

**Design constraint (PRD §5):** grayscale only. No hex/rgb literals in components — always tokens (`text-text-primary`, `bg-action-primary`, etc.). Success/error states communicated with icon + text + gray-shade contrast, never green/red.

**i18n discipline:** every visible string goes through `t()`. Both locales must have the key.

**Commands:**

```
pnpm dev              # Turbopack dev on :3000, redirects / → /es
pnpm build            # production build
pnpm typecheck        # tsc --noEmit
pnpm lint             # ESLint
pnpm format           # Prettier write
```

---

## Gotchas encountered this session

- **`zod.coerce.number()` + react-hook-form 7 collide** — the schema's input type becomes `unknown` and the resolver generic fails. Use `z.number()` + `register("hours", { valueAsNumber: true })` instead. (Fixed in `src/app/[locale]/book/[talacheroId]/booking-form.tsx`.)
- **Route type params shape** — next-intl `<Link href={{ pathname, params }}>` didn't satisfy the typed-routes constraint. String templates work fine: ``href={`/talacheros/${id}`}``.
- **Middleware → proxy in Next 16** — the old `middleware.ts` file convention still works but emits a deprecation warning. We use `proxy.ts`.
- **create-next-app refuses non-empty dirs** — had to park `prd.md` / `plan.md` in `/tmp` during bootstrap.
- **Tailwind v4 CSS-first config** — no `tailwind.config.ts`; all tokens live in `@theme` blocks inside `globals.css`. Utilities are auto-generated from `--color-*` variables, which is why token names like `text-text-primary` are correct (double "text" is intentional).
- **`redirect()` + typed routes (Phase 2)** — next-intl's `redirect` from `@/i18n/navigation` did **not** narrow control flow as `never` in server actions/components (caused "possibly null" + "lacks return"). Use `redirect` from `next/navigation` instead; because `typedRoutes` is on, a dynamic template string needs `` redirect(`/${locale}/dashboard` as Route) `` (`import type { Route } from "next"`).
- **Supabase session + next-intl in one proxy pass** — `src/proxy.ts` runs next-intl `createMiddleware` to get a `NextResponse`, then `updateSession(request, response)` **attaches Supabase auth cookies to that same response**. Don't create a second response or cookies get dropped. `updateSession`'s `setAll` also gets a 2nd `headers` arg (no-store) that must be applied.
- **Auth-aware nav made pages dynamic** — `TopNavBar` calls `getAppUser()` (reads cookies), so the previously-static locale pages now render on demand (all `ƒ` in build output). Acceptable for MVP; revisit if we want the marketing pages static again.
- **RLS recursion** — a policy on `users` that queries `users` recurses. Fix: `SECURITY DEFINER` helper functions (`is_admin()` etc.) with a pinned `search_path`; they run as owner and bypass RLS.
- **Role can't be RLS-pinned by column** — to stop `users.role` self-escalation, we `REVOKE UPDATE` on the table and re-`GRANT UPDATE (email, phone, …)` on the safe columns only. Service role bypasses this for admin ops.

---

## What to say to Claude next session

Suggested opener:

> Continuing the Talachas MVP. Phases 0–2 are done (see HANDOFF.md). Bring up the local stack (Docker + `supabase start` + `db reset`), then start Phase 3 — back the Figma screens (`/talacheros`, profile, booking) with real Supabase queries per plan.md §Phase 3. Resolve the remaining open questions (commission %, cancellation windows, chat provider) as they come up.

Next session should read `HANDOFF.md`, `plan.md` §Phase 3, and `prd.md` §6.3 (concurrency) before touching the booking mutation. Note: Phase 2 is **uncommitted** — decide whether to commit it first.
