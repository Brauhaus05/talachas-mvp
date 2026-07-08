import { redirect } from "next/navigation";
import type { Route } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getAppUser, dashboardPathForRole } from "@/lib/auth";

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await getAppUser();
  if (!user) redirect(`/${locale}/auth/sign-in` as Route);
  // Admin-only. Non-admins never see this exists — they bounce to their home.
  if (user.role !== "admin") {
    redirect(`/${locale}${dashboardPathForRole(user.role)}` as Route);
  }

  const t = await getTranslations("admin");
  const cards: { href: Route; title: string; desc: string }[] = [
    {
      href: "/dashboard/admin/users" as Route,
      title: t("nav_users"),
      desc: t("nav_users_desc"),
    },
    {
      href: "/dashboard/admin/bookings" as Route,
      title: t("nav_bookings"),
      desc: t("nav_bookings_desc"),
    },
    {
      href: "/dashboard/admin/reviews" as Route,
      title: t("nav_reviews"),
      desc: t("nav_reviews_desc"),
    },
    {
      href: "/dashboard/admin/disputes" as Route,
      title: t("nav_disputes"),
      desc: t("nav_disputes_desc"),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-text-primary text-2xl font-semibold">
          {t("overview_title")}
        </h1>
        <p className="text-text-secondary mt-1 text-sm">{t("overview_subtitle")}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="border-border hover:bg-surface-muted rounded-lg border p-5 transition-colors"
          >
            <h2 className="text-text-primary font-medium">{c.title}</h2>
            <p className="text-text-secondary mt-1 text-sm">{c.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
