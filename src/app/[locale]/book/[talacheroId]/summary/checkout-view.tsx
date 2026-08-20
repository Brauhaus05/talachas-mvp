"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  CheckCircle2,
  MapPin,
  Calendar,
  Clock,
  CreditCard,
  AlertCircle,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import type { ServiceSlug } from "@/lib/mock/services";
import { confirmBooking, type ConfirmState } from "./actions";

export interface CheckoutData {
  talacheroId: string;
  talacheroName: string;
  talacheroInitials: string;
  slotId: string;
  service: ServiceSlug;
  description: string;
  address: string;
  date: string;
  time: string;
  hours: number;
  hourlyRateMxn: number;
  subtotalMxn: number;
  platformFeeMxn: number;
  totalMxn: number;
  currencyLocale: string;
}

const initialState: ConfirmState = { status: "idle" };

export function CheckoutView({ data }: { data: CheckoutData }) {
  const t = useTranslations();
  const [state, formAction, isPending] = useActionState(confirmBooking, initialState);

  return (
    <main className="mx-auto max-w-4xl px-10 py-12">
      <ol className="text-text-muted mb-8 flex items-center gap-3 text-xs tracking-widest uppercase">
        <li>1. {t("booking.step_details")}</li>
        <span aria-hidden>→</span>
        <li className="text-text-primary font-semibold">
          2. {t("booking.step_summary")}
        </li>
      </ol>

      <div className="mb-8 flex items-center gap-4">
        <Avatar initials={data.talacheroInitials} size="md" />
        <div className="flex flex-col">
          <h1 className="text-text-primary text-3xl font-semibold tracking-tight">
            {t("checkout.page_title")}
          </h1>
          <p className="text-text-muted text-sm">
            {t("checkout.with_talachero", { name: data.talacheroName })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* Order details */}
        <section className="border-border bg-surface-raised flex flex-col gap-5 border p-6">
          <SummaryRow
            icon={<CheckCircle2 className="h-4 w-4" />}
            label={t("checkout.summary_service")}
            value={t(`services.${data.service}.name`)}
            detail={data.description || undefined}
          />
          <SummaryRow
            icon={<Calendar className="h-4 w-4" />}
            label={t("checkout.summary_date")}
            value={`${data.date} · ${data.time}`}
          />
          <SummaryRow
            icon={<MapPin className="h-4 w-4" />}
            label={t("checkout.summary_address")}
            value={data.address || "—"}
          />
          <SummaryRow
            icon={<Clock className="h-4 w-4" />}
            label={t("checkout.summary_estimate")}
            value={t("checkout.hours", { count: data.hours })}
          />
          <SummaryRow
            icon={<CreditCard className="h-4 w-4" />}
            label={t("booking.field_payment")}
            value={t("booking.payment_card")}
          />
        </section>

        {/* Totals */}
        <aside className="border-border bg-surface-raised flex flex-col gap-4 border p-6">
          <LineItem
            label={t("checkout.line_subtotal")}
            value={formatMoney(data.subtotalMxn, data.currencyLocale)}
          />
          <div className="border-border border-t pt-4">
            <LineItem
              label={t("checkout.line_total")}
              value={formatMoney(data.totalMxn, data.currencyLocale)}
              emphasis
            />
          </div>
          <p className="text-text-muted text-xs leading-relaxed">
            {t("checkout.fee_note")}
          </p>

          {state.status === "error" && (
            <div
              role="alert"
              className="border-border-strong bg-surface-muted text-text-primary flex items-start gap-3 border px-4 py-3 text-sm"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{t(`checkout.error_${state.error}`)}</span>
            </div>
          )}

          <form action={formAction} className="flex flex-col gap-2">
            <input type="hidden" name="talacheroId" value={data.talacheroId} />
            <input type="hidden" name="slotId" value={data.slotId} />
            <input type="hidden" name="service" value={data.service} />
            <input type="hidden" name="hours" value={data.hours} />
            <input type="hidden" name="address" value={data.address} />
            <input type="hidden" name="description" value={data.description} />
            <Button type="submit" size="lg" disabled={isPending} className="mt-2 w-full">
              {isPending ? t("common.loading") : t("checkout.confirm_cta")}
            </Button>
          </form>
          <p className="text-text-muted text-center text-xs leading-relaxed">
            {t("checkout.policy_note")}
          </p>
        </aside>
      </div>
    </main>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <span className="bg-surface-muted text-text-primary flex h-9 w-9 items-center justify-center">
        {icon}
      </span>
      <div className="flex flex-1 flex-col">
        <p className="text-text-muted text-xs tracking-wider uppercase">{label}</p>
        <p className="text-text-primary text-sm font-medium">{value}</p>
        {detail && <p className="text-text-secondary mt-1 text-xs">{detail}</p>}
      </div>
    </div>
  );
}

function LineItem({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        "flex items-baseline justify-between " +
        (emphasis
          ? "text-text-primary text-lg font-semibold"
          : "text-text-secondary text-sm")
      }
    >
      <span>{label}</span>
      <span className={emphasis ? "text-text-primary" : "text-text-primary font-medium"}>
        {value}
      </span>
    </div>
  );
}
