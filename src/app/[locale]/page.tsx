import { setRequestLocale, getTranslations } from "next-intl/server";
import { Search, ArrowRight, ShieldCheck, Clock, Star } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ServiceTile } from "@/components/services/service-tile";
import { Avatar } from "@/components/ui/avatar";
import { SERVICES } from "@/lib/mock/services";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  const featured = SERVICES.find((s) => s.featured)!;
  const others = SERVICES.filter((s) => !s.featured).slice(0, 3);

  return (
    <>
      {/* Hero */}
      <section className="border-border border-b">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-16 px-10 py-24 lg:grid-cols-2 lg:items-center">
          <div className="flex flex-col gap-8">
            <h1 className="text-text-primary text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              {t("home.hero_title")}
            </h1>
            <p className="text-text-secondary max-w-lg text-lg leading-relaxed">
              {t("home.hero_subtitle")}
            </p>

            <form
              className="border-border bg-background flex flex-col overflow-hidden rounded-2xl border sm:flex-row"
              action="/talacheros"
            >
              <label className="flex flex-1 items-center gap-3 px-5 py-4">
                <Search className="text-text-muted h-5 w-5" aria-hidden />
                <input
                  type="search"
                  name="q"
                  placeholder={t("home.hero_input_placeholder")}
                  className="text-text-primary placeholder:text-text-muted w-full bg-transparent text-sm focus:outline-none"
                  aria-label={t("home.hero_input_placeholder")}
                />
              </label>
              <Button
                type="submit"
                size="lg"
                className="rounded-none sm:rounded-l-none"
              >
                {t("home.hero_cta")}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </form>

            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                <Avatar initials="CM" size="sm" className="border-background ring-background ring-2" />
                <Avatar initials="AL" size="sm" className="border-background ring-background ring-2" />
                <Avatar initials="JH" size="sm" className="border-background ring-background ring-2" />
              </div>
              <p className="text-text-muted text-sm">{t("home.trust_line")}</p>
            </div>
          </div>

          {/* Image slot — grayscale placeholder */}
          <div className="border-border bg-surface relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-3xl border">
            <div className="bg-surface-muted absolute inset-6 rounded-2xl" />
            <div className="relative z-10 grid w-full max-w-sm grid-cols-2 gap-3 p-6">
              <div className="border-border bg-background flex flex-col gap-2 rounded-xl border p-4 shadow-sm">
                <ShieldCheck className="text-text-primary h-5 w-5" aria-hidden />
                <p className="text-text-primary text-sm font-semibold">
                  {t("profile.verified_badge")}
                </p>
              </div>
              <div className="border-border bg-background flex flex-col gap-2 rounded-xl border p-4 shadow-sm">
                <Clock className="text-text-primary h-5 w-5" aria-hidden />
                <p className="text-text-primary text-sm font-semibold">
                  {t("profile.response_value")}
                </p>
              </div>
              <div className="border-border bg-background col-span-2 flex items-center gap-3 rounded-xl border p-4 shadow-sm">
                <Star className="text-text-primary h-5 w-5 fill-current" aria-hidden />
                <p className="text-text-primary text-sm font-semibold">
                  4.9 / 5.0 — 2,500+ {t("common.reviews_count", { count: 2500 })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services — Bento grid */}
      <section>
        <div className="mx-auto max-w-7xl px-10 py-24">
          <div className="mb-12 flex items-end justify-between gap-6">
            <div className="flex flex-col gap-3">
              <h2 className="text-text-primary text-4xl font-semibold tracking-tight">
                {t("home.services_title")}
              </h2>
              <p className="text-text-secondary max-w-lg text-base">
                {t("home.services_subtitle")}
              </p>
            </div>
            <Link
              href="/talacheros"
              className="text-text-primary hidden text-sm font-medium hover:underline md:inline-flex md:items-center md:gap-2"
            >
              {t("home.services_view_all")}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 lg:row-span-2">
              <ServiceTile service={featured} size="lg" />
            </div>
            {others.map((s) => (
              <ServiceTile key={s.slug} service={s} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
