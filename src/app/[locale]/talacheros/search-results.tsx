"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Star } from "lucide-react";
import { TalacheroCard } from "@/components/talacheros/talachero-card";
import { SERVICES, type ServiceSlug } from "@/lib/mock/services";
import type { Talachero } from "@/lib/mock/talacheros";
import { cn } from "@/lib/utils";

type Availability = "any" | "today" | "week";
type Sort = "recommended" | "price_asc" | "rating";

export function SearchResults({ talacheros }: { talacheros: Talachero[] }) {
  const t = useTranslations();

  const [service, setService] = useState<ServiceSlug | "any">("any");
  const [maxPrice, setMaxPrice] = useState(400);
  const [minRating, setMinRating] = useState(0);
  const [availability, setAvailability] = useState<Availability>("any");
  const [sort, setSort] = useState<Sort>("recommended");

  const filtered = useMemo(() => {
    const list = talacheros.filter((tl) => {
      if (service !== "any" && !tl.services.includes(service)) return false;
      if (tl.hourlyRateMxn > maxPrice) return false;
      if (tl.ratingAvg < minRating) return false;
      if (availability === "today" && !tl.availableToday) return false;
      return true;
    });
    return list.sort((a, b) => {
      if (sort === "price_asc") return a.hourlyRateMxn - b.hourlyRateMxn;
      if (sort === "rating") return b.ratingAvg - a.ratingAvg;
      // recommended: rating desc, then availability
      const availDiff =
        (b.availableToday ? 1 : 0) - (a.availableToday ? 1 : 0);
      if (availDiff !== 0) return availDiff;
      return b.ratingAvg - a.ratingAvg;
    });
  }, [talacheros, service, maxPrice, minRating, availability, sort]);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_1fr]">
      <aside className="border-border bg-surface-raised h-fit rounded-2xl border p-6">
        <h2 className="text-text-primary mb-4 text-sm font-semibold uppercase tracking-wider">
          {t("search.filters_title")}
        </h2>

        <FilterGroup label={t("search.filter_service")}>
          <FilterOption
            active={service === "any"}
            onClick={() => setService("any")}
          >
            {t("common.starting_at")} ⋯
          </FilterOption>
          {SERVICES.map((s) => (
            <FilterOption
              key={s.slug}
              active={service === s.slug}
              onClick={() => setService(s.slug)}
            >
              {t(`services.${s.slug}.short`)}
            </FilterOption>
          ))}
        </FilterGroup>

        <FilterGroup label={t("search.filter_price")}>
          <input
            type="range"
            min={100}
            max={500}
            step={10}
            value={maxPrice}
            onChange={(e) => setMaxPrice(Number(e.target.value))}
            className="accent-text-primary w-full"
            aria-label={t("search.filter_price")}
          />
          <p className="text-text-secondary text-xs">≤ ${maxPrice} MXN/h</p>
        </FilterGroup>

        <FilterGroup label={t("search.filter_rating")}>
          <div className="flex gap-1">
            {[0, 3, 4, 4.5].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setMinRating(v)}
                className={cn(
                  "flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                  minRating === v
                    ? "border-border-strong bg-action-primary text-text-inverse"
                    : "border-border bg-background text-text-secondary hover:bg-surface-muted"
                )}
              >
                {v === 0 ? t("common.starting_at") : `${v}+`}
                {v > 0 && <Star className="ml-1 inline h-3 w-3 fill-current" />}
              </button>
            ))}
          </div>
        </FilterGroup>

        <FilterGroup label={t("search.filter_availability")}>
          {(
            [
              ["any", "availability_any"],
              ["today", "availability_today"],
              ["week", "availability_week"],
            ] as const
          ).map(([value, key]) => (
            <FilterOption
              key={value}
              active={availability === value}
              onClick={() => setAvailability(value)}
            >
              {t(`search.${key}`)}
            </FilterOption>
          ))}
        </FilterGroup>
      </aside>

      <section className="flex flex-col gap-6">
        <header className="flex items-center justify-between gap-4">
          <p className="text-text-secondary text-sm">
            {t("search.results_count", { count: filtered.length })}
          </p>
          <label className="text-text-secondary flex items-center gap-2 text-sm">
            <span>{t("search.sort_label")}:</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="border-border bg-background text-text-primary rounded-md border px-2 py-1 text-sm"
            >
              <option value="recommended">{t("search.sort_recommended")}</option>
              <option value="price_asc">{t("search.sort_price_asc")}</option>
              <option value="rating">{t("search.sort_rating")}</option>
            </select>
          </label>
        </header>

        {filtered.length === 0 ? (
          <div className="border-border bg-surface-raised text-text-secondary rounded-2xl border p-12 text-center text-sm">
            {t("search.empty_state")}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {filtered.map((tl) => (
              <TalacheroCard key={tl.id} talachero={tl} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border mb-5 flex flex-col gap-2 border-b pb-5 last:mb-0 last:border-b-0 last:pb-0">
      <p className="text-text-secondary text-xs font-medium uppercase tracking-wider">
        {label}
      </p>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function FilterOption({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center rounded-md px-3 py-1.5 text-left text-sm transition-colors",
        active
          ? "bg-action-primary text-text-inverse"
          : "text-text-secondary hover:bg-surface-muted"
      )}
    >
      {children}
    </button>
  );
}
