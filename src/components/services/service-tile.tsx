import { getTranslations, getLocale } from "next-intl/server";
import { ArrowUpRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { IconTile } from "@/components/ui/icon-tile";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import type { ServiceCategory } from "@/lib/mock/services";

export async function ServiceTile({
  service,
  size = "sm",
}: {
  service: ServiceCategory;
  size?: "sm" | "lg";
}) {
  const t = await getTranslations();
  const locale = await getLocale();
  const isLarge = size === "lg";

  return (
    <Link
      href="/talacheros"
      className="group border-border bg-surface-raised hover:border-border-strong relative flex h-full flex-col justify-between overflow-hidden border transition-colors"
    >
      <div className={isLarge ? "p-8" : "p-6"}>
        <div className="flex items-start justify-between">
          <IconTile
            icon={service.icon}
            size={isLarge ? "lg" : "md"}
            className="bg-action-primary text-text-inverse"
          />
          <ArrowUpRight
            className="text-text-muted group-hover:text-text-primary h-5 w-5 transition-colors"
            aria-hidden
          />
        </div>
      </div>
      <div className={isLarge ? "p-8 pt-0" : "p-6 pt-0"}>
        <Badge variant="outline" className="mb-3">
          {t(`services.${service.slug}.tag`)}
        </Badge>
        <h3
          className={
            isLarge
              ? "text-text-primary text-3xl leading-tight font-semibold"
              : "text-text-primary text-xl leading-tight font-semibold"
          }
        >
          {t(`services.${service.slug}.name`)}
        </h3>
        <p className="text-text-secondary mt-2 text-sm">
          {t(`services.${service.slug}.description`)}
        </p>
        <p className="text-text-muted mt-4 text-xs tracking-wider uppercase">
          {t("common.starting_at")} {formatMoney(service.startingRateMxn, locale)}
          {t("common.per_hour")}
        </p>
      </div>
    </Link>
  );
}
