"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { RatingInput } from "@/components/ui/rating-input";
import { submitReview, type ReviewState } from "./actions";

const ERROR_KEYS: Record<string, string> = {
  invalid_rating: "error_invalid_rating",
  already_reviewed: "error_already_reviewed",
};

export function ReviewForm({ bookingId }: { bookingId: string }) {
  const t = useTranslations("reviews");
  const [state, formAction, pending] = useActionState<ReviewState, FormData>(
    submitReview,
    {}
  );

  const errorMsg = state.error ? t(ERROR_KEYS[state.error] ?? "error_generic") : null;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="bookingId" value={bookingId} />

      <div className="flex flex-col gap-2">
        <span
          id="review-rating-label"
          className="text-text-secondary text-sm font-medium"
        >
          {t("rating_label")}
        </span>
        <RatingInput
          name="rating"
          ariaLabel={(n) => t("star_aria", { n })}
          labelledBy="review-rating-label"
        />
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-text-secondary text-sm font-medium">
          {t("comment_label")}
        </span>
        <textarea
          name="comment"
          rows={4}
          placeholder={t("comment_placeholder")}
          className="border-border-strong bg-surface text-text-primary border px-3 py-2 text-sm"
        />
      </label>

      {errorMsg && (
        <p role="alert" className="text-text-primary text-sm">
          {errorMsg}
        </p>
      )}

      <Button type="submit" size="sm" loading={pending} className="w-fit">
        {t("submit")}
      </Button>
    </form>
  );
}
