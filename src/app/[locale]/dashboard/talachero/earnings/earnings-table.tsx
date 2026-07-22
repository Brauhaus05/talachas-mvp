import { getTranslations, getLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import type { EarningRow } from "@/lib/data/talacheros";

export async function EarningsTable({ rows }: { rows: EarningRow[] }) {
  const t = await getTranslations("earnings");
  if (rows.length === 0) {
    return <p className="text-text-secondary text-sm">{t("empty")}</p>;
  }
  const locale = await getLocale();
  const ts = await getTranslations("services");
  const dateFmt = new Intl.DateTimeFormat(locale, {
    timeZone: "America/Mexico_City",
    day: "numeric",
    month: "short",
  });
  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="text-text-secondary border-border border-b">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_date")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_client")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_service")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_amount")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_commission")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_tip")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_net")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_status")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.bookingId}
              className="border-border border-b align-top last:border-0"
            >
              <td className="text-text-secondary px-4 py-3">
                {dateFmt.format(new Date(r.date))}
              </td>
              <td className="text-text-primary px-4 py-3">{r.clientName}</td>
              <td className="text-text-secondary px-4 py-3">
                {ts(`${r.serviceSlug}.short`)}
              </td>
              <td className="text-text-primary px-4 py-3">
                {formatMoney(r.gross, locale, r.currency)}
              </td>
              <td className="text-text-secondary px-4 py-3">
                {r.commission > 0
                  ? `−${formatMoney(r.commission, locale, r.currency)}`
                  : "—"}
              </td>
              <td className="text-text-secondary px-4 py-3">
                {r.tip > 0 ? formatMoney(r.tip, locale, r.currency) : "—"}
              </td>
              <td className="text-text-primary px-4 py-3 font-medium">
                {formatMoney(r.net, locale, r.currency)}
              </td>
              <td className="px-4 py-3">
                <Badge variant="muted">
                  {t(r.refunded ? "status_refunded" : "status_paid")}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
