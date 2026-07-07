"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppUser } from "@/lib/auth";
import { refundCapturedBooking } from "@/lib/stripe/refunds";

/** Ban or unban a user. `banned` arrives as the string "true"/"false" from the
 * hidden form field. Errors from admin_set_ban (e.g. cannot_ban_admin) are
 * swallowed — the UI never offers ban on an admin row, and the RPC is the
 * authoritative guard regardless. */
export async function setBan(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const banned = String(formData.get("banned") ?? "") === "true";
  const supabase = await createClient();
  await supabase.rpc("admin_set_ban", { p_user_id: userId, p_banned: banned });
  revalidatePath(`/${await getLocale()}/dashboard/admin/users`);
}

export async function deleteReview(formData: FormData) {
  const reviewId = String(formData.get("reviewId") ?? "");
  const supabase = await createClient();
  await supabase.rpc("admin_delete_review", { p_review_id: reviewId });
  revalidatePath(`/${await getLocale()}/dashboard/admin/reviews`);
}

/** Force-refund a captured booking. Required authorization check: this path
 * reads via the service client (bypasses RLS) and calls no is_admin()-guarded
 * RPC, so this is the only gate. Then verify the booking is captured and
 * best-effort refund; the charge.refunded webhook reconciles payment_status +
 * ledger. */
export async function forceRefund(formData: FormData) {
  const bookingId = String(formData.get("bookingId") ?? "");
  const user = await getAppUser();
  if (user?.role !== "admin") return;

  const { data: booking } = await createServiceClient()
    .from("bookings")
    .select("stripe_payment_intent_id, payment_status")
    .eq("id", bookingId)
    .maybeSingle();

  if (booking?.payment_status === "captured" && booking.stripe_payment_intent_id) {
    try {
      await refundCapturedBooking(booking.stripe_payment_intent_id);
    } catch {
      // best-effort; webhook remains the source of truth
    }
  }
  revalidatePath(`/${await getLocale()}/dashboard/admin/bookings`);
}
