# Talachero Profile Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a signed-in talachero a self-service editor for their own core profile fields (bio, hourly rate, services + primary, years of experience).

**Architecture:** All writes go through one `SECURITY DEFINER` RPC (`update_talachero_profile`) because direct UPDATE on `talachero_profiles` is revoked from the authenticated role. A dedicated route `/dashboard/talachero/profile` renders a `useActionState` form; the data layer reads the caller's own row (allowed by RLS SELECT). The dashboard's "coming soon" profile placeholder becomes a link to the editor.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Supabase (Postgres RPC + RLS), next-intl (es/en), TypeScript strict, Tailwind v4, pnpm.

> **No test runner in this repo** (per `CLAUDE.md`). "Verify" = `pnpm typecheck` + `pnpm lint` clean per task, `pnpm build` at the end, plus the driven walkthrough in the final task. Spanish (`messages/es.json`) is the default locale — keep both locales in sync. Base branch: `feat/talachero-profile-editor` (off `main`; does NOT depend on the button-states polish PR).

---

## File Structure

- **Create** `supabase/migrations/20260716120001_update_talachero_profile.sql` — the RPC + grants.
- **Regenerate** `src/lib/supabase/database.types.ts` — via `gen types` after the migration.
- **Modify** `src/lib/data/talacheros.ts` — add `getMyTalacheroProfileForEdit()` + its view type.
- **Create** `src/app/[locale]/dashboard/talachero/profile/actions.ts` — `updateTalacheroProfile` server action.
- **Create** `src/app/[locale]/dashboard/talachero/profile/profile-form.tsx` — client form.
- **Create** `src/app/[locale]/dashboard/talachero/profile/page.tsx` — server route + role guard.
- **Modify** `src/app/[locale]/dashboard/talachero/page.tsx` — placeholder → link card.
- **Modify** `messages/es.json`, `messages/en.json` — `profileEditor` namespace + one dashboard CTA key.

---

## Task 1: Database RPC `update_talachero_profile`

**Files:**
- Create: `supabase/migrations/20260716120001_update_talachero_profile.sql`
- Regenerate: `src/lib/supabase/database.types.ts`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260716120001_update_talachero_profile.sql`:

```sql
-- Talachero self-service profile editor (Sprint 2).
-- Direct UPDATE on talachero_profiles is revoked from `authenticated`
-- (20260703170001_stripe_fields.sql), so every profile mutation goes through
-- this SECURITY DEFINER RPC. It validates auth.uid() owns the profile, writes
-- ONLY the editable columns (bio, hourly_rate, years_experience), and replaces
-- the talachero_services set atomically. Verification/stripe/rating columns are
-- never touched here.
create or replace function public.update_talachero_profile(
  p_bio               text,
  p_hourly_rate       numeric,
  p_years_experience  integer,
  p_service_slugs     text[],
  p_primary_slug      text
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_talachero_id uuid;
  v_bio          text;
  v_matched      integer;
  v_primary_id   uuid;
begin
  select id into v_talachero_id
  from public.talachero_profiles
  where user_id = auth.uid();

  if v_talachero_id is null then
    raise exception 'no_profile';
  end if;

  -- bio: optional, trimmed, <= 600 chars (empty -> NULL)
  v_bio := nullif(btrim(coalesce(p_bio, '')), '');
  if v_bio is not null and char_length(v_bio) > 600 then
    raise exception 'bio_too_long';
  end if;

  -- hourly_rate: required, 50..2000
  if p_hourly_rate is null or p_hourly_rate < 50 or p_hourly_rate > 2000 then
    raise exception 'rate_out_of_range';
  end if;

  -- years_experience: optional, 0..60
  if p_years_experience is not null
     and (p_years_experience < 0 or p_years_experience > 60) then
    raise exception 'experience_invalid';
  end if;

  -- services: >= 1, every slug must resolve to a real category
  if p_service_slugs is null or array_length(p_service_slugs, 1) is null then
    raise exception 'no_service';
  end if;

  select count(distinct sc.id) into v_matched
  from public.service_categories sc
  where sc.slug = any(p_service_slugs);

  if v_matched <> cardinality(array(select distinct unnest(p_service_slugs))) then
    raise exception 'no_service';
  end if;

  -- primary: required, must be one of the selected slugs
  if p_primary_slug is null or not (p_primary_slug = any(p_service_slugs)) then
    raise exception 'primary_not_selected';
  end if;
  select id into v_primary_id
  from public.service_categories
  where slug = p_primary_slug;

  update public.talachero_profiles
  set bio              = v_bio,
      hourly_rate      = p_hourly_rate,
      years_experience = p_years_experience
  where id = v_talachero_id;

  delete from public.talachero_services where talachero_id = v_talachero_id;

  insert into public.talachero_services (talachero_id, service_category_id, is_primary)
  select v_talachero_id, sc.id, (sc.id = v_primary_id)
  from public.service_categories sc
  where sc.slug = any(p_service_slugs);
end;
$$;

revoke all on function public.update_talachero_profile(text, numeric, integer, text[], text) from public;
grant execute on function public.update_talachero_profile(text, numeric, integer, text[], text) to authenticated;
```

- [ ] **Step 2: Apply the migration locally (non-destructive)**

Run: `pnpm exec supabase migration up --local`
Expected: applies `20260716120001_update_talachero_profile` with no error. (Uses `migration up`, NOT `db reset`, so any Stripe onboarding state survives.)

- [ ] **Step 3: Regenerate DB types**

Run: `pnpm exec supabase gen types typescript --local > src/lib/supabase/database.types.ts`
Expected: `database.types.ts` now contains `update_talachero_profile` under `Functions`.

- [ ] **Step 4: Verify typecheck still clean**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260716120001_update_talachero_profile.sql src/lib/supabase/database.types.ts
git commit -m "feat(db): update_talachero_profile RPC for self-service profile editing"
```

---

## Task 2: Data layer read — `getMyTalacheroProfileForEdit`

**Files:**
- Modify: `src/lib/data/talacheros.ts`

- [ ] **Step 1: Add the view type and reader**

Append to `src/lib/data/talacheros.ts` (the file already imports `createClient` and `ServiceSlug`):

```ts
export interface MyTalacheroProfileEdit {
  bio: string;
  hourlyRate: number | null;
  yearsExperience: number | null;
  services: ServiceSlug[];
  primaryService: ServiceSlug | null;
}

/**
 * The signed-in talachero's own editable profile: core fields + selected
 * services. Reads the caller's own row directly (RLS SELECT allows
 * user_id = auth.uid(); talachero_services + service_categories are public
 * read). Returns null if the caller has no profile.
 */
export async function getMyTalacheroProfileForEdit(): Promise<MyTalacheroProfileEdit | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("talachero_profiles")
    .select(
      "bio, hourly_rate, years_experience, talachero_services(is_primary, service_categories(slug))"
    )
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const rows = (data.talachero_services ?? []) as Array<{
    is_primary: boolean;
    service_categories: { slug: string } | null;
  }>;
  const services = rows
    .map((r) => r.service_categories?.slug)
    .filter((s): s is string => Boolean(s)) as ServiceSlug[];
  const primaryService = (rows.find((r) => r.is_primary)?.service_categories?.slug ??
    null) as ServiceSlug | null;

  return {
    bio: data.bio ?? "",
    hourlyRate: data.hourly_rate === null ? null : Number(data.hourly_rate),
    yearsExperience: data.years_experience,
    services,
    primaryService,
  };
}
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors. (If the generated embed type is looser than the cast expects, the explicit `as Array<…>` cast keeps it sound — this mirrors the row-cast style already used in this file.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/talacheros.ts
git commit -m "feat(data): getMyTalacheroProfileForEdit reader"
```

---

## Task 3: Server action — `updateTalacheroProfile`

**Files:**
- Create: `src/app/[locale]/dashboard/talachero/profile/actions.ts`

- [ ] **Step 1: Write the action**

Create `src/app/[locale]/dashboard/talachero/profile/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

export type ProfileState = {
  status: "idle" | "success" | "error";
  error?: string;
};

/** Map update_talachero_profile's raised codes to a known, translatable set;
 * anything unexpected collapses to "generic". `no_profile` shouldn't surface
 * behind the role guard, so it also collapses to generic. Mirrors
 * mapReviewError() in the review action. */
function mapProfileError(message: string): string {
  const known = [
    "bio_too_long",
    "rate_out_of_range",
    "experience_invalid",
    "no_service",
    "primary_not_selected",
  ];
  const m = message.toLowerCase();
  return known.find((code) => m.includes(code)) ?? "generic";
}

export async function updateTalacheroProfile(
  _prev: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const bio = String(formData.get("bio") ?? "");
  const hourlyRate = Number(formData.get("hourlyRate"));
  const yearsRaw = formData.get("yearsExperience");
  const yearsExperience =
    yearsRaw === null || String(yearsRaw).trim() === "" ? null : Number(yearsRaw);
  const services = formData.getAll("services").map(String);
  const primary = String(formData.get("primary") ?? "");
  const locale = await getLocale();

  // Fast mirror of the RPC's validation so obvious cases skip the round-trip.
  if (!Number.isFinite(hourlyRate) || hourlyRate < 50 || hourlyRate > 2000) {
    return { status: "error", error: "rate_out_of_range" };
  }
  if (services.length === 0) {
    return { status: "error", error: "no_service" };
  }
  if (!primary || !services.includes(primary)) {
    return { status: "error", error: "primary_not_selected" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_talachero_profile", {
    p_bio: bio,
    p_hourly_rate: hourlyRate,
    p_years_experience: yearsExperience,
    p_service_slugs: services,
    p_primary_slug: primary,
  });

  if (error) {
    return { status: "error", error: mapProfileError(error.message) };
  }

  revalidatePath(`/${locale}/dashboard/talachero/profile`);
  return { status: "success" };
}
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors. (Depends on Task 1's regenerated types so `rpc("update_talachero_profile", …)` is known.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/dashboard/talachero/profile/actions.ts"
git commit -m "feat(talachero): updateTalacheroProfile server action"
```

---

## Task 4: i18n messages

**Files:**
- Modify: `messages/es.json`
- Modify: `messages/en.json`

- [ ] **Step 1: Add the `profileEditor` namespace to `messages/es.json`**

Add a top-level `"profileEditor"` object (place it after the existing `"dashboard"` block; keep valid JSON — mind the trailing comma on the preceding block):

```json
  "profileEditor": {
    "title": "Tu perfil",
    "subtitle": "Actualiza tu información para que los clientes te encuentren y reserven.",
    "bio_label": "Sobre ti",
    "bio_placeholder": "Cuéntales a los clientes tu experiencia y en qué destacas.",
    "rate_label": "Tarifa por hora (MXN)",
    "experience_label": "Años de experiencia",
    "services_label": "Servicios que ofreces",
    "primary_hint": "Marca uno como tu servicio principal con la estrella.",
    "set_primary": "Marcar como servicio principal",
    "save_cta": "Guardar cambios",
    "saving": "Guardando…",
    "success": "Perfil actualizado.",
    "error_bio_too_long": "La descripción no puede superar 600 caracteres.",
    "error_rate_out_of_range": "La tarifa debe estar entre 50 y 2000 MXN.",
    "error_experience_invalid": "Los años de experiencia deben estar entre 0 y 60.",
    "error_no_service": "Selecciona al menos un servicio.",
    "error_primary_not_selected": "Elige cuál es tu servicio principal.",
    "error_generic": "No pudimos guardar tu perfil. Inténtalo de nuevo."
  },
```

- [ ] **Step 2: Add the matching `profileEditor` namespace to `messages/en.json`**

```json
  "profileEditor": {
    "title": "Your profile",
    "subtitle": "Update your details so clients can find and book you.",
    "bio_label": "About you",
    "bio_placeholder": "Tell clients about your experience and what you're great at.",
    "rate_label": "Hourly rate (MXN)",
    "experience_label": "Years of experience",
    "services_label": "Services you offer",
    "primary_hint": "Mark one as your primary service with the star.",
    "set_primary": "Set as primary service",
    "save_cta": "Save changes",
    "saving": "Saving…",
    "success": "Profile updated.",
    "error_bio_too_long": "Your bio can't be longer than 600 characters.",
    "error_rate_out_of_range": "The rate must be between 50 and 2000 MXN.",
    "error_experience_invalid": "Years of experience must be between 0 and 60.",
    "error_no_service": "Select at least one service.",
    "error_primary_not_selected": "Choose which service is your primary one.",
    "error_generic": "We couldn't save your profile. Please try again."
  },
```

- [ ] **Step 3: Add the dashboard CTA key (both locales)**

In `messages/es.json` inside the `"dashboard"` object, add after `"talachero_profile_desc"`:

```json
    "talachero_profile_cta": "Editar perfil",
```

In `messages/en.json` inside the `"dashboard"` object, add after `"talachero_profile_desc"`:

```json
    "talachero_profile_cta": "Edit profile",
```

- [ ] **Step 4: Verify JSON validity + typecheck**

Run: `pnpm exec tsc --noEmit && node -e "require('./messages/es.json'); require('./messages/en.json'); console.log('json ok')"`
Expected: `json ok` and no typecheck errors.

- [ ] **Step 5: Commit**

```bash
git add messages/es.json messages/en.json
git commit -m "i18n: profile editor copy (es/en)"
```

---

## Task 5: Client form — `profile-form.tsx`

**Files:**
- Create: `src/app/[locale]/dashboard/talachero/profile/profile-form.tsx`

- [ ] **Step 1: Write the form component**

Create `src/app/[locale]/dashboard/talachero/profile/profile-form.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SERVICES, type ServiceSlug } from "@/lib/mock/services";
import { cn } from "@/lib/utils";
import type { MyTalacheroProfileEdit } from "@/lib/data/talacheros";
import { updateTalacheroProfile, type ProfileState } from "./actions";

export function ProfileForm({ initial }: { initial: MyTalacheroProfileEdit }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(
    updateTalacheroProfile,
    { status: "idle" }
  );

  const [services, setServices] = useState<ServiceSlug[]>(initial.services);
  const [primary, setPrimary] = useState<ServiceSlug | null>(
    initial.primaryService ?? initial.services[0] ?? null
  );

  function toggleService(slug: ServiceSlug) {
    setServices((prev) => {
      if (prev.includes(slug)) {
        const next = prev.filter((s) => s !== slug);
        setPrimary((p) => (p === slug ? (next[0] ?? null) : p));
        return next;
      }
      setPrimary((p) => p ?? slug);
      return [...prev, slug];
    });
  }

  const banner =
    "flex items-start gap-3 rounded-md border border-border-strong bg-surface-muted px-4 py-3 text-sm text-text-primary";

  const errorMsg =
    state.status === "error"
      ? t(`profileEditor.error_${state.error ?? "generic"}`)
      : null;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.status === "success" && (
        <div role="status" className={banner}>
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{t("profileEditor.success")}</span>
        </div>
      )}
      {errorMsg && (
        <div role="alert" className={banner}>
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{errorMsg}</span>
        </div>
      )}

      <label className="flex flex-col gap-2">
        <span className="text-text-secondary text-xs font-medium tracking-wider uppercase">
          {t("profileEditor.bio_label")}
        </span>
        <textarea
          name="bio"
          rows={4}
          maxLength={600}
          defaultValue={initial.bio}
          placeholder={t("profileEditor.bio_placeholder")}
          className="border-border bg-surface text-text-primary rounded-md border px-3 py-2 text-sm"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-text-secondary text-xs font-medium tracking-wider uppercase">
          {t("profileEditor.rate_label")}
        </span>
        <Input
          name="hourlyRate"
          type="number"
          min={50}
          max={2000}
          step={10}
          required
          defaultValue={initial.hourlyRate ?? ""}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-text-secondary text-xs font-medium tracking-wider uppercase">
          {t("profileEditor.experience_label")}
        </span>
        <Input
          name="yearsExperience"
          type="number"
          min={0}
          max={60}
          step={1}
          defaultValue={initial.yearsExperience ?? ""}
        />
      </label>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-text-secondary text-xs font-medium tracking-wider uppercase">
          {t("profileEditor.services_label")}
        </legend>
        <div className="flex flex-wrap gap-2">
          {SERVICES.map((s) => {
            const selected = services.includes(s.slug);
            const isPrimary = primary === s.slug;
            return (
              <div key={s.slug} className="flex items-center">
                <button
                  type="button"
                  onClick={() => toggleService(s.slug)}
                  aria-pressed={selected}
                  className={cn(
                    "rounded-l-md border px-3 py-1.5 text-sm font-medium transition-colors",
                    !selected && "rounded-r-md",
                    selected
                      ? "border-border-strong bg-action-primary text-text-inverse"
                      : "border-border bg-background text-text-secondary hover:bg-surface-muted"
                  )}
                >
                  {t(`services.${s.slug}.short`)}
                </button>
                {selected && (
                  <button
                    type="button"
                    onClick={() => setPrimary(s.slug)}
                    aria-pressed={isPrimary}
                    aria-label={t("profileEditor.set_primary")}
                    title={t("profileEditor.set_primary")}
                    className="border-border-strong text-text-inverse bg-action-primary rounded-r-md border border-l-0 px-2 py-1.5"
                  >
                    <Star
                      className="h-4 w-4"
                      aria-hidden
                      fill={isPrimary ? "currentColor" : "none"}
                      strokeWidth={1.5}
                    />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-text-muted text-xs">{t("profileEditor.primary_hint")}</p>

        {services.map((s) => (
          <input key={s} type="hidden" name="services" value={s} />
        ))}
        {primary && <input type="hidden" name="primary" value={primary} />}
      </fieldset>

      <Button type="submit" size="sm" disabled={pending} className="w-fit">
        {pending ? t("profileEditor.saving") : t("profileEditor.save_cta")}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors. (`useActionState` returns `[state, action, isPending]` in React 19 — the `pending` binding matches `sign-in-form.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/dashboard/talachero/profile/profile-form.tsx"
git commit -m "feat(talachero): profile editor form"
```

---

## Task 6: Route page — `profile/page.tsx`

**Files:**
- Create: `src/app/[locale]/dashboard/talachero/profile/page.tsx`

- [ ] **Step 1: Write the server page + role guard**

Create `src/app/[locale]/dashboard/talachero/profile/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { getAppUser, dashboardPathForRole } from "@/lib/auth";
import { getMyTalacheroProfileForEdit } from "@/lib/data/talacheros";
import { ProfileForm } from "./profile-form";

export default async function TalacheroProfilePage({
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

  const t = await getTranslations("profileEditor");
  const initial = (await getMyTalacheroProfileForEdit()) ?? {
    bio: "",
    hourlyRate: null,
    yearsExperience: null,
    services: [],
    primaryService: null,
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-text-primary text-2xl font-semibold">{t("title")}</h1>
        <p className="text-text-secondary mt-1 text-sm">{t("subtitle")}</p>
      </div>
      <ProfileForm initial={initial} />
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors. (`redirect` returns `never`, so `user` is non-null afterward — same pattern as `dashboard/talachero/page.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/dashboard/talachero/profile/page.tsx"
git commit -m "feat(talachero): profile editor route + role guard"
```

---

## Task 7: Wire dashboard placeholder → link, and verify end-to-end

**Files:**
- Modify: `src/app/[locale]/dashboard/talachero/page.tsx`

- [ ] **Step 1: Replace the profile `PlaceholderPanel` with a link card**

In `src/app/[locale]/dashboard/talachero/page.tsx`, add these imports near the existing imports:

```tsx
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
```

Then replace this block:

```tsx
        <PlaceholderPanel
          title={t("talachero_profile")}
          description={t("talachero_profile_desc")}
          comingSoon={t("coming_soon")}
        />
```

with:

```tsx
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("talachero_profile")}</CardTitle>
            <CardDescription>{t("talachero_profile_desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/dashboard/talachero/profile"
              className={buttonVariants({ size: "sm" })}
            >
              {t("talachero_profile_cta")}
            </Link>
          </CardContent>
        </Card>
```

Leave the `talachero_schedule` `PlaceholderPanel` untouched. If `PlaceholderPanel` is now unused in this file, remove it from the import.

- [ ] **Step 2: Verify typecheck + lint + build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: all clean; the build output lists the new route `/[locale]/dashboard/talachero/profile`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/dashboard/talachero/page.tsx"
git commit -m "feat(talachero): link dashboard to the profile editor"
```

- [ ] **Step 4: Driven walkthrough (manual verification)**

Ensure the local stack is running (`pnpm exec supabase status`; migration from Task 1 applied) and `pnpm dev` is up. Then:

1. Sign in as a seeded talachero (`supabase/seed.sql`, password `password123`).
2. Go to `/dashboard/talachero` → click **Editar perfil** → lands on `/dashboard/talachero/profile` with current values pre-filled.
3. Edit bio, set hourly rate (e.g. 300), set years (e.g. 5), toggle 2–3 services, star a different primary → **Guardar cambios**.
4. Confirm the success banner appears; reload → values persist.
5. Open the public `/talacheros/[id]` for that talachero → the new bio/rate/services show.
6. Negative checks: set rate to `10` → save → `error_rate_out_of_range`; deselect all services → save → `error_no_service`.

Expected: all pass. If the public profile doesn't reflect changes, confirm `list_talacheros`/`getTalacheroById` reads the same columns (they do — `hourly_rate`, `bio`, services) and that the walkthrough talachero is `verified`.

---

## Notes for the implementer

- **Do not** touch stripe/verification/rating columns anywhere — the RPC writes only `bio`, `hourly_rate`, `years_experience` and the `talachero_services` rows.
- Keep both locale files in sync; Spanish is the default and must never be missing a key the English file has.
- The form's service chips are intentionally raw toggle `<button>`s (selection state), consistent with the existing `search-results`/`booking-form` chips — do not convert them to the shared `Button`.
- This branch is off `main`; it does not use the button-states `loading` prop. Submit uses `disabled={pending}` + a "Saving…" label, matching `sign-in-form.tsx`.
