"use client";

import { useTranslations, useLocale } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Rating } from "@/components/ui/rating";
import { Badge } from "@/components/ui/badge";
import { formatMxn } from "@/lib/format";
import type { Talachero } from "@/lib/mock/talacheros";

export function TalacheroCard({ talachero }: { talachero: Talachero }) {
  const t = useTranslations();
  const locale = useLocale();
  const secondaryServices = talachero.services.filter(
    (s) => s !== talachero.primaryService
  );

  return (
    <article className="border-border bg-surface-raised hover:border-border-strong flex flex-col gap-4 rounded-2xl border p-6 transition-colors">
      <header className="flex items-start gap-4">
        <Avatar initials={talachero.initials} size="lg" />
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <h3 className="text-text-primary text-lg font-semibold">
              {talachero.name}
            </h3>
            {talachero.verified && (
              <CheckCircle2
                className="text-text-primary h-4 w-4"
                aria-label={t("profile.verified_badge")}
              />
            )}
          </div>
          <p className="text-text-muted text-xs">{talachero.neighborhood}</p>
          <Rating
            value={talachero.ratingAvg}
            reviewsCount={talachero.ratingCount}
          />
        </div>
        <div className="flex flex-col items-end gap-1">
          <p className="text-text-primary text-lg font-semibold">
            {formatMxn(talachero.hourlyRateMxn, locale)}
            <span className="text-text-muted text-xs font-normal">
              {t("common.per_hour")}
            </span>
          </p>
          {talachero.availableToday && (
            <Badge variant="outline">{t("search.availability_today")}</Badge>
          )}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="muted">
          {t(`services.${talachero.primaryService}.short`)}
        </Badge>
        {secondaryServices.slice(0, 2).map((s) => (
          <Badge key={s} variant="muted">
            {t(`services.${s}.short`)}
          </Badge>
        ))}
        {secondaryServices.length > 2 && (
          <span className="text-text-muted text-xs">
            +{secondaryServices.length - 2} {t("common.and_more")}
          </span>
        )}
      </div>

      <div className="border-border flex items-center justify-between border-t pt-4">
        <p className="text-text-secondary text-xs">
          {t("common.jobs_completed", { count: talachero.jobsCompleted })}
        </p>
        <Link
          href={`/talacheros/${talachero.id}`}
          className="text-text-primary text-sm font-medium hover:underline"
        >
          {t("search.view_profile")} →
        </Link>
      </div>
    </article>
  );
}
