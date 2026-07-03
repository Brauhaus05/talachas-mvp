import { setRequestLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { getAppUser } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Authoritative auth gate (the proxy guard is only optimistic).
  const user = await getAppUser();
  if (!user) {
    redirect(`/${locale}/auth/sign-in` as Route);
  }

  const t = await getTranslations("dashboard");
  const name = user.fullName?.split(" ")[0] ?? user.email ?? "";

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <header className="border-border mb-10 flex items-center justify-between border-b pb-6">
        <p className="text-text-primary text-xl font-semibold">
          {t("greeting", { name })}
        </p>
        <Badge variant="muted">{t(`role_badge_${user.role}`)}</Badge>
      </header>
      {children}
    </main>
  );
}
