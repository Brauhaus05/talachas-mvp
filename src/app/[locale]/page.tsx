import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 text-center">
        <p className="text-text-muted text-sm font-medium tracking-widest uppercase">
          {t("meta.brand")}
        </p>
        <h1 className="text-text-primary text-5xl leading-tight font-semibold tracking-tight sm:text-6xl">
          {t("home.hero_title")}
        </h1>
        <p className="text-text-secondary mx-auto max-w-2xl text-lg">
          {t("home.hero_subtitle")}
        </p>
        <div className="mt-4 flex justify-center">
          <Button size="lg">{t("home.hero_cta")}</Button>
        </div>
        <p className="text-text-muted text-sm">{t("home.trust_line")}</p>
      </div>
    </main>
  );
}
