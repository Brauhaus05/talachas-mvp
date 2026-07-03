"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, MapPin, Calendar, Clock, CreditCard } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatMxn } from "@/lib/format";
import type { ServiceSlug } from "@/lib/mock/services";

export interface CheckoutData {
  talacheroName: string;
  talacheroInitials: string;
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

const TIP_PRESETS = [0, 50, 100, 200];

export function CheckoutView({ data }: { data: CheckoutData }) {
  const t = useTranslations();
  const [tip, setTip] = useState(0);
  const [confirmed, setConfirmed] = useState(false);

  const grandTotal = useMemo(
    () => data.totalMxn + tip,
    [data.totalMxn, tip]
  );

  if (confirmed) {
    return (
      <main className="mx-auto max-w-xl px-10 py-24">
        <div className="border-border bg-surface-raised flex flex-col items-center gap-4 rounded-3xl border p-10 text-center">
          <div className="bg-action-primary text-text-inverse flex h-16 w-16 items-center justify-center rounded-full">
            <CheckCircle2 className="h-8 w-8" aria-hidden />
          </div>
          <h1 className="text-text-primary text-3xl font-semibold tracking-tight">
            {t("checkout.success_title")}
          </h1>
          <p className="text-text-secondary text-sm">
            {t("checkout.success_body", { name: data.talacheroName })}
          </p>
          <Link href="/">
            <Button size="lg" className="mt-4">
              {t("checkout.success_next")}
            </Button>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-10 py-12">
      <ol className="text-text-muted mb-8 flex items-center gap-3 text-xs uppercase tracking-widest">
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
        <section className="border-border bg-surface-raised flex flex-col gap-5 rounded-2xl border p-6">
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
        <aside className="border-border bg-surface-raised flex flex-col gap-4 rounded-2xl border p-6">
          <LineItem
            label={t("checkout.line_subtotal")}
            value={formatMxn(data.subtotalMxn, data.currencyLocale)}
          />
          <LineItem
            label={t("checkout.line_platform_fee")}
            value={formatMxn(data.platformFeeMxn, data.currencyLocale)}
          />
          <div className="flex flex-col gap-2">
            <p className="text-text-secondary text-xs">
              {t("checkout.line_tip")}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {TIP_PRESETS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTip(v)}
                  className={
                    "border-border rounded-md border px-2 py-1.5 text-xs font-medium transition-colors " +
                    (tip === v
                      ? "bg-action-primary text-text-inverse border-border-strong"
                      : "bg-background text-text-secondary hover:bg-surface-muted")
                  }
                >
                  {v === 0 ? "0" : `+${v}`}
                </button>
              ))}
            </div>
          </div>
          <div className="border-border border-t pt-4">
            <LineItem
              label={t("checkout.line_total")}
              value={formatMxn(grandTotal, data.currencyLocale)}
              emphasis
            />
          </div>
          <Button
            size="lg"
            className="mt-2 w-full"
            onClick={() => setConfirmed(true)}
          >
            {t("checkout.confirm_cta")}
          </Button>
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
      <span className="bg-surface-muted text-text-primary flex h-9 w-9 items-center justify-center rounded-lg">
        {icon}
      </span>
      <div className="flex flex-1 flex-col">
        <p className="text-text-muted text-xs uppercase tracking-wider">
          {label}
        </p>
        <p className="text-text-primary text-sm font-medium">{value}</p>
        {detail && (
          <p className="text-text-secondary mt-1 text-xs">{detail}</p>
        )}
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
