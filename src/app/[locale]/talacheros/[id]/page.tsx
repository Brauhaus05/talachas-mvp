import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations, getLocale } from "next-intl/server";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Rating } from "@/components/ui/rating";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/ui/stat-tile";
import { IconTile } from "@/components/ui/icon-tile";
import { ReviewCard } from "@/components/talacheros/review-card";
import { getTalacheroById } from "@/lib/data/talacheros";
import { getService } from "@/lib/mock/services";
import { formatMoney } from "@/lib/format";

export default async function TalacheroProfilePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const talachero = await getTalacheroById(id);
  if (!talachero) notFound();

  const t = await getTranslations();
  const currentLocale = await getLocale();
  const bio = currentLocale === "en" ? talachero.bioEn : talachero.bioEs;

  return (
    <main className="mx-auto max-w-6xl px-10 py-12">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="text-text-muted mb-8 flex items-center gap-2 text-xs"
      >
        <Link href="/talacheros" className="hover:text-text-primary">
          {t("search.page_title")}
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden />
        <span className="text-text-secondary">{talachero.name}</span>
      </nav>

      {/* Hero */}
      <section className="border-border bg-surface-raised mb-8 rounded-3xl border p-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-6">
            <Avatar initials={talachero.initials} size="xl" />
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <h1 className="text-text-primary text-3xl font-semibold tracking-tight">
                  {talachero.name}
                </h1>
                {talachero.verified && (
                  <Badge>
                    <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden />
                    {t("profile.verified_badge")}
                  </Badge>
                )}
              </div>
              <p className="text-text-secondary text-sm">
                {talachero.neighborhood} · {t("search.city_label")}
              </p>
              <Rating
                value={talachero.ratingAvg}
                reviewsCount={talachero.ratingCount}
                size="md"
              />
              <p className="text-text-muted text-sm">
                {t("common.years_experience", { count: talachero.yearsExperience })}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-4 md:items-end">
            <div className="flex flex-col md:items-end">
              <span className="text-text-primary text-4xl font-semibold">
                {formatMoney(talachero.hourlyRateMxn, currentLocale)}
              </span>
              <span className="text-text-muted text-xs tracking-wider uppercase">
                {t("common.per_hour").replace("/", "")}
              </span>
            </div>
            <Link href={`/book/${talachero.id}`}>
              <Button size="lg">{t("profile.book_cta")}</Button>
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile
            value={talachero.jobsCompleted.toString()}
            label={t("profile.stat_jobs")}
          />
          <StatTile
            value={talachero.ratingAvg.toFixed(1)}
            label={t("profile.stat_rating")}
          />
          <StatTile
            value={t("profile.response_value")}
            label={t("profile.stat_response")}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-8">
          {/* Services */}
          <section>
            <h2 className="text-text-primary mb-4 text-xl font-semibold">
              {t("profile.section_services")}
            </h2>
            <div className="border-border bg-surface-raised divide-border divide-y overflow-hidden rounded-2xl border">
              {talachero.services.map((slug) => {
                const svc = getService(slug);
                if (!svc) return null;
                return (
                  <div key={slug} className="flex items-center gap-4 p-5">
                    <IconTile icon={svc.icon} />
                    <div className="flex flex-1 flex-col">
                      <p className="text-text-primary text-sm font-semibold">
                        {t(`services.${slug}.name`)}
                      </p>
                      <p className="text-text-muted text-xs">
                        {t(`services.${slug}.description`)}
                      </p>
                    </div>
                    <p className="text-text-primary text-sm font-medium">
                      {formatMoney(svc.startingRateMxn, currentLocale)}
                      <span className="text-text-muted text-xs font-normal">
                        {t("common.per_hour")}
                      </span>
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* About */}
          <section>
            <h2 className="text-text-primary mb-4 text-xl font-semibold">
              {t("profile.section_about")}
            </h2>
            <div className="border-border bg-surface-raised rounded-2xl border p-6">
              <p className="text-text-secondary text-sm leading-relaxed">{bio}</p>
            </div>
          </section>

          {/* Reviews */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-text-primary text-xl font-semibold">
                {t("profile.section_reviews")}
              </h2>
              <p className="text-text-muted text-sm">
                {t("common.reviews_count", { count: talachero.ratingCount })}
              </p>
            </div>
            <div className="flex flex-col gap-4">
              {talachero.reviews.map((r) => (
                <ReviewCard key={r.id} review={r} />
              ))}
            </div>
          </section>
        </div>

        {/* Sticky booking rail */}
        <aside className="hidden lg:block">
          <div className="border-border bg-surface-raised sticky top-28 flex flex-col gap-4 rounded-2xl border p-6">
            <p className="text-text-muted text-xs tracking-widest uppercase">
              {t("common.starting_at")}
            </p>
            <p className="text-text-primary text-3xl font-semibold">
              {formatMoney(talachero.hourlyRateMxn, currentLocale)}
              <span className="text-text-muted text-sm font-normal">
                {t("common.per_hour")}
              </span>
            </p>
            <Link href={`/book/${talachero.id}`}>
              <Button className="w-full">{t("profile.book_cta")}</Button>
            </Link>
            {talachero.availableToday && (
              <p className="text-text-secondary text-center text-xs">
                {t("search.availability_today")} ✓
              </p>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
