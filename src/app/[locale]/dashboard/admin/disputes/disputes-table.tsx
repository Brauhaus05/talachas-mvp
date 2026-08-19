import { getTranslations, getLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import type { AdminDispute } from "@/lib/data/admin";
import { resolveDispute } from "../actions";
import { ConfirmButton } from "../confirm-button";
import { PaymentBadge } from "../payment-badge";

export async function DisputesTable({ disputes }: { disputes: AdminDispute[] }) {
  const t = await getTranslations("admin");
  if (disputes.length === 0) {
    return <p className="text-text-secondary text-sm">{t("empty")}</p>;
  }
  const locale = await getLocale();
  // Includes the year, unlike the earnings table this pattern comes from: that
  // one lists a talachero's recent payouts, whereas resolved disputes are an
  // audit trail where a case closed 14 months ago must not read the same as one
  // closed last month.
  const dateFmt = new Intl.DateTimeFormat(locale, {
    timeZone: "America/Mexico_City",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="text-text-secondary border-border border-b">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_client")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_talachero")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_amount")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_reason")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_status")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_payment")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_resolved")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_actions")}
            </th>
          </tr>
        </thead>
        <tbody>
          {disputes.map((d) => (
            <tr key={d.id} className="border-border border-b align-top last:border-0">
              <td className="text-text-primary px-4 py-3">{d.clientName}</td>
              <td className="text-text-primary px-4 py-3">{d.talacheroName}</td>
              <td className="text-text-primary px-4 py-3">
                {formatMoney(d.price, locale, d.currency)}
              </td>
              <td className="text-text-secondary max-w-xs px-4 py-3 break-words">
                {d.reason}
              </td>
              <td className="px-4 py-3">
                <Badge variant="muted">{t(`status_${d.status}`)}</Badge>
              </td>
              <td className="px-4 py-3">
                <PaymentBadge status={d.paymentStatus} />
              </td>
              <td className="text-text-secondary px-4 py-3">
                {d.resolvedAt ? (
                  dateFmt.format(new Date(d.resolvedAt))
                ) : (
                  <span className="text-text-muted text-xs">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                {d.status === "open" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={resolveDispute}>
                      <input type="hidden" name="disputeId" value={d.id} />
                      <input type="hidden" name="action" value="refund" />
                      <ConfirmButton label={t("action_refund")} tone="danger" />
                    </form>
                    <form action={resolveDispute}>
                      <input type="hidden" name="disputeId" value={d.id} />
                      <input type="hidden" name="action" value="dismiss" />
                      <ConfirmButton label={t("action_dismiss")} tone="neutral" />
                    </form>
                  </div>
                ) : (
                  <span className="text-text-muted text-xs">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
