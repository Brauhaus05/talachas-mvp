import { getTranslations } from "next-intl/server";
import type { AdminReview } from "@/lib/data/admin";
import { deleteReview } from "../actions";
import { ConfirmButton } from "../confirm-button";

export async function ReviewsTable({ reviews }: { reviews: AdminReview[] }) {
  const t = await getTranslations("admin");
  if (reviews.length === 0) {
    return <p className="text-text-secondary text-sm">{t("empty")}</p>;
  }
  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="text-text-secondary border-border border-b">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_author")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_target")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_rating")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_comment")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_actions")}
            </th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((r) => (
            <tr key={r.id} className="border-border border-b last:border-0">
              <td className="text-text-primary px-4 py-3">{r.authorName}</td>
              <td className="text-text-primary px-4 py-3">{r.targetName}</td>
              <td className="text-text-primary px-4 py-3">{r.rating} / 5</td>
              <td className="text-text-secondary max-w-xs px-4 py-3">{r.comment ?? ""}</td>
              <td className="px-4 py-3">
                <form action={deleteReview}>
                  <input type="hidden" name="reviewId" value={r.id} />
                  <ConfirmButton label={t("action_delete")} tone="danger" />
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
