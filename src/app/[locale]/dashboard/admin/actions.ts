"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppUser } from "@/lib/auth";
import { refundBookingIfCaptured } from "@/lib/stripe/refunds";

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
  await refundBookingIfCaptured(bookingId);
  revalidatePath(`/${await getLocale()}/dashboard/admin/bookings`);
}

/** Resolve a dispute. `action` is "refund" or "dismiss". Admin-only (this reads
 * via the service client, so the role check is the app-level gate;
 * admin_resolve_dispute also self-gates on is_admin()). Refund path: attempt the
 * shared best-effort refund; only record the dispute as refunded if the refund
 * was actually issued — otherwise leave it open so the admin can retry or
 * dismiss (no phantom "refunded"). Dismiss path: record the dismissal. */
export async function resolveDispute(formData: FormData) {
  const disputeId = String(formData.get("disputeId") ?? "");
  const action = String(formData.get("action") ?? "");
  const user = await getAppUser();
  if (user?.role !== "admin") return;

  const locale = await getLocale();
  let refunded = false;

  if (action === "refund") {
    const { data: dispute } = await createServiceClient()
      .from("disputes")
      .select("booking_id")
      .eq("id", disputeId)
      .maybeSingle();
    if (dispute?.booking_id) {
      refunded = await refundBookingIfCaptured(dispute.booking_id);
    }
    // Refund failed or booking not refundable → leave the dispute open (don't
    // record a refund that didn't happen); the admin can retry or dismiss.
    if (!refunded) {
      revalidatePath(`/${locale}/dashboard/admin/disputes`);
      return;
    }
  }

  const supabase = await createClient();
  await supabase.rpc("admin_resolve_dispute", {
    p_dispute_id: disputeId,
    p_refunded: refunded,
  });
  revalidatePath(`/${locale}/dashboard/admin/disputes`);
}
