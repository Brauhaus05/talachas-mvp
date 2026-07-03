import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { getAppUser, dashboardPathForRole } from "@/lib/auth";
import { PlaceholderPanel } from "../dashboard-ui";

export default async function TalacheroDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await getAppUser();

  if (!user) {
    redirect(`/${locale}/auth/sign-in` as Route);
  }
  // Role guard: only talacheros belong here; anyone else goes to their own home.
  if (user.role !== "talachero") {
    redirect(`/${locale}${dashboardPathForRole(user.role)}` as Route);
  }

  const t = await getTranslations("dashboard");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-text-primary text-2xl font-semibold">
          {t("talachero_title")}
        </h1>
        <p className="text-text-secondary mt-1 text-sm">{t("talachero_subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <PlaceholderPanel
          title={t("talachero_profile")}
          description={t("talachero_profile_desc")}
          comingSoon={t("coming_soon")}
        />
        <PlaceholderPanel
          title={t("talachero_schedule")}
          description={t("talachero_schedule_desc")}
          comingSoon={t("coming_soon")}
        />
        <PlaceholderPanel
          title={t("talachero_requests")}
          description={t("talachero_requests_desc")}
          comingSoon={t("coming_soon")}
        />
      </div>
    </div>
  );
}
