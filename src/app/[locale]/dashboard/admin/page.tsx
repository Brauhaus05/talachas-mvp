import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { getAppUser, dashboardPathForRole } from "@/lib/auth";
import { PlaceholderPanel } from "../dashboard-ui";

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await getAppUser();

  if (!user) {
    redirect(`/${locale}/auth/sign-in` as Route);
  }
  // Admin-only. Non-admins never see this exists — they bounce to their home.
  if (user.role !== "admin") {
    redirect(`/${locale}${dashboardPathForRole(user.role)}` as Route);
  }

  const t = await getTranslations("dashboard");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-text-primary text-2xl font-semibold">{t("admin_title")}</h1>
        <p className="text-text-secondary mt-1 text-sm">{t("admin_subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <PlaceholderPanel
          title={t("admin_users")}
          description={t("admin_subtitle")}
          comingSoon={t("coming_soon")}
        />
        <PlaceholderPanel
          title={t("admin_bookings")}
          description={t("admin_subtitle")}
          comingSoon={t("coming_soon")}
        />
        <PlaceholderPanel
          title={t("admin_disputes")}
          description={t("admin_subtitle")}
          comingSoon={t("coming_soon")}
        />
      </div>
    </div>
  );
}
