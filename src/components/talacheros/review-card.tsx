import { useLocale } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Rating } from "@/components/ui/rating";
import type { TalacheroReview } from "@/lib/mock/talacheros";

export function ReviewCard({ review }: { review: TalacheroReview }) {
  const locale = useLocale();
  const body = locale === "en" ? review.bodyEn : review.bodyEs;
  const timeLabel =
    locale === "en" ? `${review.daysAgo}d ago` : `Hace ${review.daysAgo}d`;

  return (
    <article className="border-border bg-surface-raised flex flex-col gap-3 border p-5">
      <header className="flex items-center gap-3">
        <Avatar initials={review.authorInitials} size="sm" />
        <div className="flex flex-1 flex-col">
          <p className="text-text-primary text-sm font-medium">{review.authorName}</p>
          <p className="text-text-muted text-xs">{timeLabel}</p>
        </div>
        <Rating value={review.rating} />
      </header>
      <p className="text-text-secondary text-sm leading-relaxed">{body}</p>
    </article>
  );
}
