import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { getAppUser, dashboardPathForRole } from "@/lib/auth";
import { getMyEarnings } from "@/lib/data/talacheros";
import { EarningsSummary } from "./earnings-summary";
import { EarningsTable } from "./earnings-table";

export default async function TalacheroEarningsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await getAppUser();
  if (!user) {
    redirect(`/${locale}/auth/sign-in` as Route);
  }
  if (user.role !== "talachero") {
    redirect(`/${locale}${dashboardPathForRole(user.role)}` as Route);
  }

  const t = await getTranslations("earnings");
  const { rows, summary } = await getMyEarnings();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-text-primary text-2xl font-semibold">{t("title")}</h1>
        <p className="text-text-secondary mt-1 text-sm">{t("subtitle")}</p>
      </div>
      <EarningsSummary summary={summary} />
      <EarningsTable rows={rows} />
    </div>
  );
}
