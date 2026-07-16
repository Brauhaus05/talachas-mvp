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
