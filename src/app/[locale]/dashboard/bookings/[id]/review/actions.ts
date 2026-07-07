"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { notifyNewReview } from "@/lib/notifications/notify";

export type ReviewState = { error?: string };

/** Map create_review's raised codes to a known, translatable set; anything
 * unexpected (e.g. a raw Postgres cast error) collapses to "generic". Mirrors
 * mapError()/errorCode() in the booking/auth actions. */
function mapReviewError(message: string): string {
  const known = [
    "invalid_rating",
    "already_reviewed",
    "booking_not_completed",
    "not_your_booking",
    "booking_not_found",
    "not_authenticated",
  ];
  const m = message.toLowerCase();
  return known.find((code) => m.includes(code)) ?? "generic";
}

/** Client submits a review for a completed booking. On success: fire the
 * best-effort new-review email and redirect to the dashboard. On failure:
 * return a typed error code for the form to localize. */
export async function submitReview(
  _prev: ReviewState,
  formData: FormData
): Promise<ReviewState> {
  const bookingId = String(formData.get("bookingId") ?? "");
  const rating = Number(formData.get("rating")) || 0;
  const comment = String(formData.get("comment") ?? "");
  const locale = await getLocale();

  if (rating < 1 || rating > 5) {
    return { error: "invalid_rating" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_review", {
    p_booking_id: bookingId,
    p_rating: rating,
    p_comment: comment,
  });

  if (error) {
    // error.message is the raised code (e.g. 'already_reviewed'); map it to a
    // known, translatable set so raw Postgres errors never reach the form.
    return { error: mapReviewError(error.message) };
  }

  await notifyNewReview(bookingId, rating);
  revalidatePath(`/${locale}/dashboard`);
  redirect(`/${locale}/dashboard?reviewed=1` as Route);
}
