"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations, useLocale } from "next-intl";
import { CreditCard } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ServiceSlug } from "@/lib/mock/services";
import type { TalacheroSlot } from "@/lib/data/talacheros";

const schema = z.object({
  service: z.string().min(1),
  description: z.string().min(20),
  address: z.string().min(5),
  hours: z.number().int().min(1).max(8),
  payment: z.string().min(1),
});

type FormValues = z.infer<typeof schema>;

const TZ = "America/Mexico_City";

export function BookingForm({
  talacheroId,
  allowedServices,
  slots,
}: {
  talacheroId: string;
  allowedServices: ServiceSlug[];
  slots: TalacheroSlot[];
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();

  const dayFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: TZ,
      }),
    [locale]
  );
  const timeFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: TZ,
      }),
    [locale]
  );

  // Group open slots into days (label -> slots) for a day/time picker.
  const days = useMemo(() => {
    const map = new Map<string, { label: string; slots: TalacheroSlot[] }>();
    for (const s of slots) {
      const label = dayFmt.format(new Date(s.startTime));
      const entry = map.get(label) ?? { label, slots: [] };
      entry.slots.push(s);
      map.set(label, entry);
    }
    return [...map.values()];
  }, [slots, dayFmt]);

  const [activeDay, setActiveDay] = useState(0);
  const [slotId, setSlotId] = useState<string>(slots[0]?.id ?? "");
  const [slotError, setSlotError] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      service: allowedServices[0] ?? "",
      description: "",
      address: "",
      hours: 2,
      payment: "card_4242",
    },
  });

  const onSubmit = handleSubmit((values) => {
    if (!slotId) {
      setSlotError(true);
      return;
    }
    const slot = slots.find((s) => s.id === slotId);
    const search = new URLSearchParams({
      service: values.service,
      description: values.description,
      address: values.address,
      hours: String(values.hours),
      slotId,
      slotStart: slot?.startTime ?? "",
    });
    router.push(`/book/${talacheroId}/summary?${search.toString()}`);
  });

  return (
    <form
      onSubmit={onSubmit}
      className="border-border bg-surface-raised flex flex-col gap-6 rounded-2xl border p-8"
    >
      <Field
        label={t("booking.field_service")}
        error={errors.service?.message && t("booking.required")}
      >
        <select
          {...register("service")}
          className="border-border bg-background text-text-primary focus-visible:border-border-strong flex h-11 w-full rounded-md border px-4 text-sm transition-colors focus-visible:outline-none"
        >
          {allowedServices.map((slug) => (
            <option key={slug} value={slug}>
              {t(`services.${slug}.name`)}
            </option>
          ))}
        </select>
      </Field>

      {/* Slot picker */}
      <Field
        label={t("booking.field_slot")}
        error={slotError ? t("booking.select_slot") : undefined}
      >
        {days.length === 0 ? (
          <p className="text-text-secondary border-border bg-background rounded-md border px-4 py-3 text-sm">
            {t("booking.no_slots")}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {days.map((d, i) => (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => setActiveDay(i)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    i === activeDay
                      ? "border-border-strong bg-action-primary text-text-inverse"
                      : "border-border bg-background text-text-secondary hover:bg-surface-muted"
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {days[activeDay]?.slots.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSlotId(s.id);
                    setSlotError(false);
                  }}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                    slotId === s.id
                      ? "border-border-strong bg-action-primary text-text-inverse"
                      : "border-border bg-background text-text-secondary hover:bg-surface-muted"
                  )}
                >
                  {timeFmt.format(new Date(s.startTime))}
                </button>
              ))}
            </div>
          </div>
        )}
      </Field>

      <Field
        label={t("booking.field_description")}
        error={errors.description?.message ? t("booking.description_min") : undefined}
      >
        <textarea
          {...register("description")}
          placeholder={t("booking.field_description_placeholder")}
          rows={4}
          className="border-border bg-background text-text-primary placeholder:text-text-muted focus-visible:border-border-strong flex w-full rounded-md border px-4 py-3 text-sm transition-colors focus-visible:outline-none"
        />
      </Field>

      <Field
        label={t("booking.field_address")}
        error={errors.address?.message ? t("booking.required") : undefined}
      >
        <Input
          {...register("address")}
          placeholder={t("booking.field_address_placeholder")}
        />
      </Field>

      <Field label={t("checkout.summary_estimate")}>
        <Input
          type="number"
          min={1}
          max={8}
          className="max-w-32"
          {...register("hours", { valueAsNumber: true })}
        />
      </Field>

      <Field label={t("booking.field_payment")}>
        <label className="border-border bg-background flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3">
          <input
            type="radio"
            value="card_4242"
            {...register("payment")}
            className="accent-text-primary"
            defaultChecked
          />
          <CreditCard className="text-text-secondary h-5 w-5" aria-hidden />
          <span className="text-text-primary text-sm">{t("booking.payment_card")}</span>
        </label>
      </Field>

      <Button
        type="submit"
        size="lg"
        disabled={isSubmitting || days.length === 0}
        className="w-full"
      >
        {t("booking.continue_cta")}
      </Button>
    </form>
  );
}

function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-text-secondary text-xs font-medium tracking-wider uppercase">
        {label}
      </label>
      {children}
      {error && <p className="text-text-primary text-xs">{error}</p>}
    </div>
  );
}
