import { getTranslations, getLocale } from "next-intl/server";
import { formatMoney } from "@/lib/format";
import type { EarningsView } from "@/lib/data/talacheros";

export async function EarningsSummary({ summary }: { summary: EarningsView["summary"] }) {
  const t = await getTranslations("earnings");
  const locale = await getLocale();
  const tiles = [
    { label: t("total_earned"), value: formatMoney(summary.totalNet, locale) },
    { label: t("this_month"), value: formatMoney(summary.thisMonthNet, locale) },
    { label: t("jobs_paid"), value: String(summary.jobCount) },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {tiles.map((tile) => (
        <div key={tile.label} className="border-border border p-5">
          <p className="text-text-secondary text-xs font-medium tracking-wider uppercase">
            {tile.label}
          </p>
          <p className="text-text-primary mt-2 text-2xl font-semibold">{tile.value}</p>
        </div>
      ))}
    </div>
  );
}
