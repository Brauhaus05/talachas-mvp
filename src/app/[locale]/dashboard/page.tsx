import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { Link } from "@/i18n/navigation";
import { getAppUser } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

export default async function ClientDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await getAppUser();

  // The layout already guaranteed a signed-in user; send the other roles to
  // their own dashboards so /dashboard is always the client home.
  if (!user) {
    redirect(`/${locale}/auth/sign-in` as Route);
  }
  if (user.role === "talachero") {
    redirect(`/${locale}/dashboard/talachero` as Route);
  }
  if (user.role === "admin") {
    redirect(`/${locale}/dashboard/admin` as Route);
  }

  const t = await getTranslations("dashboard");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-text-primary text-2xl font-semibold">{t("client_title")}</h1>
        <p className="text-text-secondary mt-1 text-sm">{t("client_subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("client_title")}</CardTitle>
          <CardDescription>{t("client_empty")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/talacheros" className={buttonVariants()}>
            {t("client_browse_cta")}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
