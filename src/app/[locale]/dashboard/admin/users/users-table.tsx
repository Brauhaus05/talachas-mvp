import { getTranslations } from "next-intl/server";
import type { AdminUser } from "@/lib/data/admin";
import { setBan } from "../actions";
import { ConfirmButton } from "../confirm-button";

export async function UsersTable({ users }: { users: AdminUser[] }) {
  const t = await getTranslations("admin");
  if (users.length === 0) {
    return <p className="text-text-secondary text-sm">{t("empty")}</p>;
  }
  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="text-text-secondary border-border border-b">
          <tr>
            <th className="px-4 py-3 font-medium">{t("col_name")}</th>
            <th className="px-4 py-3 font-medium">{t("col_email")}</th>
            <th className="px-4 py-3 font-medium">{t("col_role")}</th>
            <th className="px-4 py-3 font-medium">{t("col_status")}</th>
            <th className="px-4 py-3 font-medium">{t("col_actions")}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-border border-b last:border-0">
              <td className="text-text-primary px-4 py-3">{u.fullName}</td>
              <td className="text-text-secondary px-4 py-3">{u.email}</td>
              <td className="text-text-secondary px-4 py-3">{u.role}</td>
              <td className="text-text-primary px-4 py-3">
                {u.banned ? t("status_banned") : t("status_active")}
              </td>
              <td className="px-4 py-3">
                {u.role !== "admin" && (
                  <form action={setBan}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="banned" value={u.banned ? "false" : "true"} />
                    <ConfirmButton
                      label={u.banned ? t("action_unban") : t("action_ban")}
                      tone={u.banned ? "neutral" : "danger"}
                    />
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
