import { getTranslations, getLocale } from "next-intl/server";
import { formatMoney } from "@/lib/format";
import type { AdminBooking } from "@/lib/data/admin";
import { forceRefund } from "../actions";
import { ConfirmButton } from "../confirm-button";
import { PaymentBadge } from "../payment-badge";

export async function BookingsTable({ bookings }: { bookings: AdminBooking[] }) {
  const t = await getTranslations("admin");
  if (bookings.length === 0) {
    return <p className="text-text-secondary text-sm">{t("empty")}</p>;
  }
  const locale = await getLocale();
  return (
    <div className="border-border overflow-x-auto border">
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
              {t("col_payment")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_actions")}
            </th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id} className="border-border border-b last:border-0">
              <td className="text-text-primary px-4 py-3">{b.clientName}</td>
              <td className="text-text-primary px-4 py-3">{b.talacheroName}</td>
              <td className="text-text-primary px-4 py-3">
                {formatMoney(b.price, locale, b.currency)}
              </td>
              <td className="px-4 py-3">
                <PaymentBadge status={b.paymentStatus} />
              </td>
              <td className="px-4 py-3">
                <form action={forceRefund}>
                  <input type="hidden" name="bookingId" value={b.id} />
                  <ConfirmButton label={t("action_refund")} tone="danger" />
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
