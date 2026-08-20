import { getTranslations, getLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import type { AdminVerification } from "@/lib/data/admin";
import { approveTalachero } from "../actions";
import { ConfirmButton } from "../confirm-button";
import { RejectForm } from "./reject-form";

export async function VerificationsTable({
  verifications,
}: {
  verifications: AdminVerification[];
}) {
  const t = await getTranslations("admin");
  if (verifications.length === 0) {
    return <p className="text-text-secondary text-sm">{t("empty")}</p>;
  }
  const locale = await getLocale();
  const ts = await getTranslations("services");
  return (
    <div className="border-border overflow-x-auto border">
      <table className="w-full text-left text-sm">
        <thead className="text-text-secondary border-border border-b">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_talachero")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_services")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_rate")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_slots")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_payments")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_actions")}
            </th>
          </tr>
        </thead>
        <tbody>
          {verifications.map((v) => (
            <tr
              key={v.talacheroId}
              className="border-border border-b align-top last:border-0"
            >
              <td className="text-text-primary px-4 py-3">
                <div className="font-medium">{v.fullName}</div>
                {v.bio && (
                  <div className="text-text-secondary max-w-xs text-xs break-words">
                    {v.bio}
                  </div>
                )}
              </td>
              <td className="text-text-secondary px-4 py-3">
                {v.serviceSlugs.map((s) => ts(`${s}.short`)).join(", ")}
              </td>
              <td className="text-text-primary px-4 py-3">
                {formatMoney(v.hourlyRate, locale, v.currency)}
              </td>
              <td className="text-text-primary px-4 py-3">{v.slotCount}</td>
              <td className="px-4 py-3">
                <Badge variant="muted">
                  {v.chargesEnabled ? t("payments_ready") : t("payments_pending")}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-start gap-2">
                  <form action={approveTalachero}>
                    <input type="hidden" name="talacheroId" value={v.talacheroId} />
                    <ConfirmButton label={t("action_approve")} tone="danger" />
                  </form>
                  <RejectForm talacheroId={v.talacheroId} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
