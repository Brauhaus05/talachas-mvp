# Session Handoff — 2026-07-02

> Read this alongside [prd.md](./prd.md) and [plan.md](./plan.md). This doc captures what the code and git log **don't** — session decisions, open questions, and where to pick up.

## Where we are

**Phase 0 ✅ Foundation** — commit `f9b0321`
Next.js 16 + React 19 + Tailwind v4 + Turbopack. Grayscale-only design tokens in `src/app/globals.css`. Custom primitives (no shadcn CLI — its default palette adds no value in a grayscale-only design). next-intl 4.13 with `es` (default) + `en`. Prettier + husky + lint-staged + GitHub Actions CI (typecheck → lint → build).

**Phase 1 ✅ Clickable demo (5 Figma screens + mock data)** — commit `843107f`
All routes ship both locales. 66 static pages, checkout is dynamic (reads searchParams).

| Route | What |
|---|---|
| `/{es,en}` | Hero + Servicios Populares bento |
| `/{es,en}/talacheros` | Filter sidebar + card grid, client-side filtering/sort |
| `/{es,en}/talacheros/[id]` | Profile: hero, services, About, reviews, sticky booking rail |
| `/{es,en}/book/[talacheroId]` | react-hook-form + zod, 6 fields |
| `/{es,en}/book/[talacheroId]/summary` | Order summary, tip selector, 15% platform fee, Confirm → success view |

Working tree is clean. `main` is up to date. No uncommitted work.

**Phase 2 (next) — Data model + Auth**  ~2–3 days
Schema per PRD §7 in Supabase (with PostGIS), Supabase Auth for both roles + RLS, minimal role-gated dashboards. See [plan.md](./plan.md) for the full checklist.

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

## Phase 2 kickoff plan (start here tomorrow)

Prereqs: a Supabase project. If none exists:
```
# create at supabase.com/dashboard, then in the repo:
pnpm add -D supabase
pnpm exec supabase init
pnpm exec supabase link --project-ref <ref>
```

Order of work (each is a discrete PR-able chunk):

1. **Extensions + core enums** — `create extension postgis;`, define role enum, booking status enum, verification status enum.
2. **Reference tables** — `cities` (seed CDMX with `currency=MXN`, `locale=es-MX`, `timezone=America/Mexico_City`), `service_categories` (seed 8 from `src/lib/mock/services.ts`).
3. **Users + profiles** — `users` extending `auth.users`, trigger on signup, `talachero_profiles` with PostGIS `geography(Polygon)` for `coverage_area`.
4. **Availability + bookings + transactions + reviews + chat** — full PRD §7 schema.
5. **RLS policies** — client sees own bookings; talachero sees own; admin bypass; ledger table has UPDATE/DELETE revoked.
6. **Auth UI** — `/auth/sign-in`, `/auth/sign-up`, `/auth/callback` under `[locale]`. Signup includes role picker ("Necesito ayuda" / "Quiero ofrecer servicios").
7. **Role-gated dashboards** — `/dashboard` (client), `/dashboard/talachero`, `/dashboard/admin`. Empty shells that just prove routing + guards work.

**Exit criteria for Phase 2:** two real users (one client, one talachero) can sign up and land on their correct dashboard. RLS smoke test: client hitting the anon key cannot read another user's bookings.

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
- **Route type params shape** — next-intl `<Link href={{ pathname, params }}>` didn't satisfy the typed-routes constraint. String templates work fine: `` href={`/talacheros/${id}`} ``.
- **Middleware → proxy in Next 16** — the old `middleware.ts` file convention still works but emits a deprecation warning. We use `proxy.ts`.
- **create-next-app refuses non-empty dirs** — had to park `prd.md` / `plan.md` in `/tmp` during bootstrap.
- **Tailwind v4 CSS-first config** — no `tailwind.config.ts`; all tokens live in `@theme` blocks inside `globals.css`. Utilities are auto-generated from `--color-*` variables, which is why token names like `text-text-primary` are correct (double "text" is intentional).

---

## What to say to Claude tomorrow

Suggested opener:
> Continuing the Talachas MVP. Phase 0 and Phase 1 are done and committed (see HANDOFF.md). Start Phase 2 — Supabase schema + auth per plan.md. First: confirm we have a Supabase project (or create one) and answer the coverage-area/commission/slot-granularity questions before scaffolding.

Tomorrow's Claude should read `HANDOFF.md`, `plan.md` §Phase 2, and `prd.md` §6.2 + §7 before writing any migrations.
