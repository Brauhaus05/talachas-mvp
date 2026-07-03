"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { CreditCard } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ServiceSlug } from "@/lib/mock/services";

const schema = z.object({
  service: z.string().min(1),
  description: z.string().min(20),
  address: z.string().min(5),
  date: z.string().min(1),
  time: z.string().min(1),
  hours: z.number().int().min(1).max(8),
  payment: z.string().min(1),
});

type FormValues = z.infer<typeof schema>;

export function BookingForm({
  talacheroId,
  allowedServices,
}: {
  talacheroId: string;
  allowedServices: ServiceSlug[];
}) {
  const t = useTranslations();
  const router = useRouter();

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
      date: new Date().toISOString().slice(0, 10),
      time: "10:00",
      hours: 2,
      payment: "card_4242",
    },
  });

  const onSubmit = handleSubmit((values) => {
    const search = new URLSearchParams({
      service: values.service,
      description: values.description,
      address: values.address,
      date: values.date,
      time: values.time,
      hours: String(values.hours),
      payment: values.payment,
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

      <Field
        label={t("booking.field_description")}
        error={
          errors.description?.message ? t("booking.description_min") : undefined
        }
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label={t("booking.field_date")}>
          <Input type="date" {...register("date")} />
        </Field>
        <Field label={t("booking.field_time")}>
          <Input type="time" {...register("time")} />
        </Field>
        <Field label={t("checkout.summary_estimate")}>
          <Input
            type="number"
            min={1}
            max={8}
            {...register("hours", { valueAsNumber: true })}
          />
        </Field>
      </div>

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
          <span className="text-text-primary text-sm">
            {t("booking.payment_card")}
          </span>
        </label>
      </Field>

      <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
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
      <label
        className={cn(
          "text-text-secondary text-xs font-medium uppercase tracking-wider"
        )}
      >
        {label}
      </label>
      {children}
      {error && <p className="text-text-primary text-xs">{error}</p>}
    </div>
  );
}
