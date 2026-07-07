import { redirect } from "next/navigation";
import type { Route } from "next";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getAppUser, dashboardPathForRole } from "@/lib/auth";
import { listReviews } from "@/lib/data/admin";
import { ReviewsTable } from "./reviews-table";

export default async function AdminReviewsPage({
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
  const reviews = await listReviews();

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
        <h1 className="text-text-primary text-2xl font-semibold">{t("reviews_title")}</h1>
      </div>
      <ReviewsTable reviews={reviews} />
    </div>
  );
}
