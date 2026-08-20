# DESIGN-SYSTEM.md — applying `@jalo/design-system` to `talachas-mvp`

> **Install:** drop this file at the repo root of `talachas-mvp` and add `@DESIGN-SYSTEM.md` to `CLAUDE.md` next to the existing `@AGENTS.md` line.
> **Companion docs:** `JALO-DS-Migration-Strategy.md` (why) and `JALO-DS-Gap-Analysis.md` (component-by-component). This file is the *how*.

---

## 0. Orientation — you are in the app, not the design system

Two repos, and they are not the same place:

| | Path | Role |
|---|---|---|
| **This repo** | `~/Claude Projects/talachas-mvp/` | The JALO product. Consumes the DS |
| **DS** | `.../Jump After Us/02 Projects/JALO/Jalo Design System/` | `@jalo/design-system`. Owns the look |

**The DS is upstream. If a component is wrong, fix it there and republish — do not patch it here.** Local overrides of DS styling are the failure mode this whole migration exists to end. If you find yourself writing CSS that fights a `jalo-` class, stop and open a DS task instead.

The DS repo has its own `HANDOFF.md` with a session ritual. Respect it when you cross over: name the session type, run `pnpm test` + `pnpm typecheck`, run `pnpm contact-sheet` **and look at it**, update `.design-sync/conventions.md`, flag that a re-sync is owed.

---

## 1. Hard rules

These are not preferences. Several are enforced by tests in the DS; the rest are enforced by the fact that breaking them produces a product that looks like two products.

1. **Zero border radius.** Everything is square, except circles (`50%`). Never write `rounded-*` other than `rounded-full`, and never `border-radius` in CSS.
2. **Never hardcode a colour.** No `#hex`, no `rgb()`, no `text-[#…]`. This repo has **zero** hardcoded colours today — keep it that way. Use semantic tokens.
3. **`--jalo-magenta` (`#FF427E`) is a fill, never text, and it carries INK labels — not white.** White on it is 3.32:1 and fails; ink is 5.07:1 and passes. Every accent in this system carries ink — blue tags, the yellow Today badge, and now magenta. Magenta *as* text is `--jalo-magenta-ink` (`#B81E5E`).
4. **Focus rings are `--jalo-magenta-ink`, never `--jalo-magenta`.** Brand magenta is 2.51:1 on bone — below even the 3:1 graphical floor, so a ring drawn in it is invisible to the people who most need it.
5. **`--jalo-brand-blue` (`#008AD5`) is the wordmark's blue and nothing else.** Never a UI role, never text. Tag chips stay `--jalo-tag-blue` (`#4D89D1`), where ink measures 4.65:1.
6. **Never fake muted text with `opacity`.** Ink at 50% measures 3.27:1. Use `--jalo-ink-muted`. Opacity is invisible to the DS contrast suite, so it fails silently.
7. **On the inverted footer, `--jalo-ink-muted` is unreadable.** Body text is `--jalo-bone`, headings are `--jalo-highlight`.
8. **Elevation is a hard offset shadow with no blur** — `3px 3px 0`, `4px 4px 0`, `6px 6px 0`. Never a blurred shadow. Pressing collapses the shadow to `0 0 0` and translates the element by the offset (`jalo-pressable` alongside `jalo-shadow-*`).
9. **Body weight is 700, not 400.** Display type is Jost, text is Barlow. Jost is the open-source Futura-derived face standing in until the Futura licence is resolved — **it is what this app ships, even though the DS itself still self-hosts Anton; see §4 decision 3.** Buttons and eyebrows are uppercase with letter-spacing.
10. **Do not invent `jalo-`-prefixed class names.** The utility vocabulary is closed and documented in `conventions.md`. Classes like `jalo-button` exist but belong to components — never apply them by hand.
11. **Never format money by hand.** DS components take `rate`/`price`/`amount`/`total` as **numbers** and format internally via `useMoney()`. When you adopt such a component, delete the `formatMoney()` call at that call site.
12. **Never build a clickable `<div>`.** DS `Card` has `href` (renders an anchor) and `interactive` + `onSelect` (renders a button). Use them.
13. **Preserve every closed Notion fix.** PR #24 closed several UI bugs. A re-skin that regresses one is a net negative. See §6.
14. **Do not touch payments logic.** This is a re-skin. `actions.ts`, the Stripe webhook, RPC calls, and RLS behaviour are out of scope in every phase. If a visual change appears to require a data change, stop and ask.

---

## 2. Setup — do this once, before any phase

```bash
# 1. Auth to the private registry (GitHub Packages)
#    .npmrc at repo root:
#      @jalo:registry=https://npm.pkg.github.com
#      //npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}

pnpm add @jalo/design-system
```

**`src/app/[locale]/layout.tsx`** — import DS CSS and wrap in the provider:

```tsx
import '@jalo/design-system/styles.css'   // ⚠️ import-order matters, see §3
import { JaloProvider } from '@jalo/design-system'
import { Link } from '@/i18n/navigation'

// …inside <body>:
<JaloProvider locale={locale === 'es' ? 'es-MX' : 'en-CA'} currency={/* see §4 */} linkComponent={Link}>
  <NextIntlClientProvider>…</NextIntlClientProvider>
</JaloProvider>
```

`linkComponent` requires DS Phase 0.2. **Do not start Phase 3 without it** — see §3.

---

## 3. Three things that will break, and what to do

### 3.1 `"use client"` — the DS ships none

The DS has **zero** `"use client"` directives. Eight components use client-only React: `FilterRail`, `SearchBar`, `SiteHeader`, `SlotPicker`, `SortBar`, `StepIndicator`, `Card`, `Chip`.

Every page in this app is an `async` Server Component. **Importing any of those into a page throws at build time.**

**Fix upstream, in the DS.** Do not create wrapper files here — every consumer would reinvent them forever. Verify the fix by importing the built `dist` into an actual Next RSC route, not by checking that `pnpm build` passed; `tsup` has stripped directives before.

### 3.2 Raw `<a>` breaks locale routing

DS `Card`, `TalacheroCard`, `SiteHeader.links` and `SiteFooter.columns[].links` render raw `<a href>`. This app is `next-intl` with `localePrefix: "always"`. A raw anchor causes a **full page reload and drops the locale prefix**, so a Spanish user bounces through locale resolution.

**Fix upstream** via `linkComponent` on `JaloProvider` (DS Phase 0.2). Until that ships, do not adopt any DS component that navigates.

### 3.3 Two CSS resets in one page

DS `styles.css` bundles its own reset. Tailwind v4 injects preflight. Import order decides the winner and the loser produces quiet wrongness (margins, `button` font inheritance, list styling) that no test in either repo catches.

**Resolve by rendering, not reasoning.** Try DS CSS before `tailwindcss` first. If that fails, ask the DS for a `styles.no-reset.css` export. Do not paper over it with `!important`.

---

## 4. Open decisions — ask Braulio, do not choose silently

| # | Decision | Why it can't wait |
|---|---|---|
| 1 | **Currency model.** The field is `hourlyRateMxn`, display is CA$/CAD (intentional per Notion), the DS models MXN, and DS `formatCurrency` prints neither prefix (`$1,417.50` where the prototype prints `MXN $945`). | DS components format internally. The moment `TalacheroCard` is adopted, app `formatMoney` stops being called. There cannot be two formatters. Blocks Phase 3 |
| 2 | **`SiteHeader` vs. the mobile menu.** DS `SiteHeader` has **no hamburger**. Adopting it naively re-opens the P1 bug PR #24 just closed. | Blocks Phase 3.1. Default to keeping local `TopNavBar` + `MobileMenu`, restyled |
| 3 | **Fonts — Futura is licensed, and that is a hard blocker.** Braulio chose to move the system to Futura to match the wordmark. Futura is not free for web use under any of its foundries (Paratype/Adobe "Futura PT", Bitstream, URW), and the DS currently self-hosts Anton + Barlow under the OFL. Until a licence exists, **use `Jost`** — the open-source Futura-derived face on Google Fonts — as the shippable substitute. Wire it as `--font-display`; keep Barlow for text. Do **not** import DS `fonts.css` into this repo. | Blocks Phase 1 |

---

## 5. The phases

Each phase is independently shippable. Stop after any one and the app is coherent, not half-skinned. **Do not start a phase before its predecessor's exit criteria are met.**

### Phase 1 — Foundation swap · ~1 file · highest leverage

> **Prompt:** Rewrite the `@theme` block in `src/app/globals.css` so every semantic token resolves to a JALO token. Map: `background`→bone, `surface-raised`→paper, `text-primary`→ink, `text-muted`/`text-secondary`→ink-muted, `action-primary`→magenta *(fill)*, and add a separate token for magenta-as-text→magenta-ink. Set **all six `--radius-*` tokens to `0`** — the five this app already declares, plus `--radius-3xl`, which it does not (see the first straggler below). Replace Inter with Jost (`--font-display`) and Barlow (`--font-sans`) via `next/font/google`, and set base body weight to 700. **Do not modify any component file** beyond the stragglers listed below.

Setting the radius tokens to `0` flattens **62 of the 74** `rounded-*` usages at once, because Tailwind v4 resolves `rounded-xl` → `--radius-xl`. That is the trick that makes this phase nearly one file. The other 12 need hands — do them in this phase too:

- **`rounded-3xl` ×2** — `--radius-3xl` is *not* defined in this app's `@theme`, so it falls through to Tailwind's default and the token change will miss it. Define it as `0`. (`[locale]/page.tsx:77`, `[locale]/talacheros/[id]/page.tsx:45`)
- **`rounded-l-*` / `rounded-r-*` ×4** — hand-fix. (`dashboard/talachero/profile/profile-form.tsx`, `[locale]/page.tsx:48`)
- **`rounded-full` ×5 — read each one.** `50%` is allowed for genuine circles, so `ui/avatar.tsx` stays. But `ui/badge.tsx` and the notification count pills in `top-nav-bar.tsx` / `mobile-menu.tsx` are **pills, not circles** — those must go square. Do not blanket-preserve `rounded-full`.
- **`shadow-sm` ×4** — not fixed by tokens. Hand-convert to hard offset shadows (`3px 3px 0`), no blur.

Watch for: `--color-action-primary` is currently used for **both** fills and text. It must split into magenta (`#FF427E`, fill, ink label) and magenta-ink (`#B81E5E`, text and focus rings) or you will ship failing contrast.

Also note this app's `Button` sets `text-text-inverse` (white) on `bg-action-primary`. Under the new palette that pairing is 3.32:1 and **fails**. Primary buttons must carry ink. This is the single most likely thing to be got wrong in Phase 1.

**Exit:** all 26 routes swept at desktop **and** mobile width. Contrast re-verified *arithmetically* — the DS's AA guarantees cover DS pairings; this app invents pairings the DS never tested (`--color-state-warning` on `--color-surface-muted`, among others). Do not assume inheritance.

### Phase 2 — Primitive replacement · 9 files, ~320 lines

> **Prompt:** Replace one `src/components/ui/*` component at a time with its DS equivalent. Move every call site, then delete the local file. Order: `input` → `avatar` → `badge` → `rating` → `card` → `button`. Consult `JALO-DS-Gap-Analysis.md` §1 for the per-component verdict — three are direct swaps, the rest need adaptation. `rating-input`, `icon-tile` and `stat-tile` have **no** direct DS equivalent; leave them local for now.

`Card` is not a drop-in: the app exports a 6-part compound, the DS is a single element with `elevation`/`padding`/`href`. Call sites must recompose. Do it last-but-one, after the easy wins build confidence.

`Badge` variants do **not** name-map (`default|outline|muted` → `neutral|accent|ink|highlight`). Map deliberately. The "available today" badge should become DS `highlight` (yellow), not `outline`.

**Exit:** `src/components/ui/` contains only what the DS genuinely lacks. `pnpm typecheck`, `pnpm lint`, `pnpm build` all clean.

### Phase 3 — Pattern adoption, client flow · 5 screens

> **Prompt:** Adopt DS patterns one screen at a time, in this order: **3.1** landing → **3.2** catalog → **3.3** profile → **3.4** booking → **3.5** summary/confirmation. For each screen, **first read the corresponding composed story in the DS repo** (`src/patterns/CatalogScreen.stories.tsx`, `ProfileScreen.stories.tsx`, `BookingScreen.stories.tsx`, and `Screens/Booking → Confirmation`). The story is the reference composition and is more reliable than inferring layout from prop signatures. Then rewrite the page against it, preserving all existing routing, i18n keys, and server-action wiring.

**3.5 must be scheduled after Sprint 1's Stripe MX work lands.** Both touch the booking summary. Migrating a checkout UI while its payment logic is being rewritten underneath produces merge conflicts that cost more than the migration.

**Exit per screen:** rendered in a browser at desktop **and** narrow width; verified in **both** `es` and `en`; route behaviour unchanged.

On i18n: DS buttons are uppercase with `0.1em` tracking, and Spanish runs ~20% longer than English. **Test the longest real string, not the story's string.** `"Confirmar y pagar"` is not `"Book"`.

### Phase 4 — Sweep, QA, re-sync

Full visual audit, desktop + mobile, all 26 routes. This closes the Notion task *"Auditoría visual completa del MVP en producción"* (currently `En revisión`). Then cross to the DS repo: update `.design-sync/conventions.md` with everything the app taught the system, run `/design-sync`, write the `-NOTES.md`.

---

## 6. Do not regress these

PR #24 and earlier work closed real bugs. A re-skin that reopens one is a net negative. Check each after Phases 2 and 3:

- **Mobile navigation exists.** Hamburger + Catálogo/Mi panel/búsqueda reachable below `md`. (§4 decision 2)
- **Review cards show the numeric rating**, not just a star glyph (`showValue`).
- **Search filters say "Cualquier servicio/calificación"**, not "Desde" — `service_all` / `rating_all` keys.
- **No tip offer on refunded bookings** — gated on `paymentStatus === 'captured'`.
- **Landing hero shows one review count**, not "2,500+ 2500 reseñas".
- **Button states change visibly when active.** The DS press model (shadow collapse + translate) replaces `active:scale-[0.98]` — make sure it actually renders, since this was a closed UX/UI task.

---

## 7. Verification — a green suite is not evidence

This repo has **no test runner**. Verification means `pnpm typecheck` + `pnpm lint` + `pnpm build` clean, **plus rendering the screen and looking at it.**

The DS repo's handoff records this lesson four separate times: 422 passing tests, contrast arithmetic, a11y assertions and the design-DNA gate all passed simultaneously while the footer, tags, stars and avatars were wrong. Its contact sheet has found a real defect on every single run.

So, every phase:

1. `pnpm typecheck` — read the output, don't just check the exit code.
2. `pnpm lint` and `pnpm build`.
3. **Open a browser.** Desktop width and narrow width. Both locales.
4. Re-check §6.
5. If anything in the DS changed: cross over, run its suite, run `pnpm contact-sheet`, update `conventions.md`, flag the re-sync.

`.design-sync/conventions.md` is inlined into the design agent's system prompt, and that agent never sees this code. **A wrong line there is reproduced in every screen it ever generates.** Treat updating it as a gate, not a chore.

---

## 8. Out of scope

`dashboard/*` — talachero panel, admin, bookings detail/chat/dispute/review — and `auth/*`. **13 of 26 routes.**

The DS has no table, no data grid, no calendar, no tabs, no modal, no toast, no pagination. Skinning those surfaces means designing ~6 new patterns mid-migration.

They inherit Phase 1's foundation for free and will look like JALO without a single component change. Leave them there. Revisit after launch as a deliberate "DS gains a data-display vocabulary" project.
