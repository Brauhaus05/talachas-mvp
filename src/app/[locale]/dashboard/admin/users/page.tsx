import { redirect } from "next/navigation";
import type { Route } from "next";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getAppUser, dashboardPathForRole } from "@/lib/auth";
import { listUsers } from "@/lib/data/admin";
import { UsersTable } from "./users-table";

export default async function AdminUsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await getAppUser();
  if (!user) redirect(`/${locale}/auth/sign-in` as Route);
  if (user.role !== "admin") {
    redirect(`/${locale}${dashboardPathForRole(user.role)}` as Route);
  }

  const t = await getTranslations("admin");
  const users = await listUsers();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={"/dashboard/admin" as Route}
          className="text-text-secondary hover:text-text-primary mb-4 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t("back")}
        </Link>
        <h1 className="text-text-primary text-2xl font-semibold">{t("users_title")}</h1>
      </div>
      <UsersTable users={users} />
    </div>
  );
}
