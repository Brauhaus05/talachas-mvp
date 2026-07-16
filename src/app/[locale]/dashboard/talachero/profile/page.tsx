import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { getAppUser, dashboardPathForRole } from "@/lib/auth";
import { getMyTalacheroProfileForEdit } from "@/lib/data/talacheros";
import { ProfileForm } from "./profile-form";

export default async function TalacheroProfilePage({
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

  const t = await getTranslations("profileEditor");
  const initial = (await getMyTalacheroProfileForEdit()) ?? {
    bio: "",
    hourlyRate: null,
    yearsExperience: null,
    services: [],
    primaryService: null,
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-text-primary text-2xl font-semibold">{t("title")}</h1>
        <p className="text-text-secondary mt-1 text-sm">{t("subtitle")}</p>
      </div>
      <ProfileForm initial={initial} />
    </div>
  );
}
