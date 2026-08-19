"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppUser } from "@/lib/auth";
import { notifyDisputeDismissed } from "@/lib/notifications/notify";
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

/** Close an open dispute on a booking that was just refunded from the bookings
 * surface, so the two admin queues agree. admin_resolve_dispute self-gates on
 * is_admin() and only accepts an 'open' dispute, so this can never overwrite a
 * decision an admin already recorded. Note that it does NOT fully settle a race:
 * if a dismissal commits first, the dispute stays 'dismissed' on a refunded
 * booking, and the RPC refuses to reopen it — correcting that needs a SQL
 * backfill, as in 20260819120001_dispute_reconciliation.sql. */
async function closeOpenDisputeAsRefunded(bookingId: string): Promise<void> {
  const { data: dispute } = await createServiceClient()
    .from("disputes")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("status", "open")
    .maybeSingle();
  if (!dispute) return;
  const supabase = await createClient();
  await supabase.rpc("admin_resolve_dispute", {
    p_dispute_id: dispute.id,
    p_refunded: true,
  });
}

/** Force-refund a captured booking. Required authorization check: this path
 * reads via the service client (bypasses RLS) and calls no is_admin()-guarded
 * RPC for the refund itself, so this is the only gate. The charge.refunded
 * webhook reconciles payment_status + ledger. The dispute close is sequenced
 * AFTER the refund and is best-effort — a dispute-write failure must never
 * strand the money. */
export async function forceRefund(formData: FormData) {
  const bookingId = String(formData.get("bookingId") ?? "");
  const user = await getAppUser();
  if (user?.role !== "admin") return;

  const outcome = await refundBookingIfCaptured(bookingId);
  if (outcome === "refunded" || outcome === "already_refunded") {
    await closeOpenDisputeAsRefunded(bookingId);
  }

  const locale = await getLocale();
  revalidatePath(`/${locale}/dashboard/admin/bookings`);
  revalidatePath(`/${locale}/dashboard/admin/disputes`);
}

/** Resolve a dispute. `action` is "refund" or "dismiss". Admin-only (this reads
 * via the service client, so the role check is the app-level gate;
 * admin_resolve_dispute also self-gates on is_admin()).
 *
 * Refund path: record the dispute as refunded when the money is with the client
 * — either because we just refunded it, or because a force-refund / a refund
 * issued straight from the Stripe dashboard got there first ("already_refunded").
 * A genuine failure still leaves the dispute open so the admin can retry or
 * dismiss (no phantom "refunded").
 *
 * Dismiss path: record the dismissal and tell the client. The refund path sends
 * no email here — notifyRefundIssued already fires from charge.refunded. */
export async function resolveDispute(formData: FormData) {
  const disputeId = String(formData.get("disputeId") ?? "");
  const action = String(formData.get("action") ?? "");
  const user = await getAppUser();
  if (user?.role !== "admin") return;
  // Anything that isn't an explicit refund/dismiss is a malformed or replayed
  // POST. Don't let it fall through to the dismiss path and tell a client their
  // report was closed.
  if (action !== "refund" && action !== "dismiss") return;

  const locale = await getLocale();
  const revalidateBoth = () => {
    revalidatePath(`/${locale}/dashboard/admin/disputes`);
    revalidatePath(`/${locale}/dashboard/admin/bookings`);
  };

  const { data: dispute } = await createServiceClient()
    .from("disputes")
    .select("booking_id")
    .eq("id", disputeId)
    .maybeSingle();

  let refunded = false;
  if (action === "refund") {
    // Only the refund path genuinely needs the booking; the dismiss path uses
    // booking_id solely for the email, so a failed read must not turn Descartar
    // into a silent no-op.
    if (!dispute?.booking_id) {
      revalidateBoth();
      return;
    }
    const outcome = await refundBookingIfCaptured(dispute.booking_id);
    refunded = outcome === "refunded" || outcome === "already_refunded";
    if (!refunded) {
      revalidateBoth();
      return;
    }
  }

  const supabase = await createClient();
  // supabase-js returns { error } rather than throwing, so a lost race
  // (dispute_not_open) arrives here silently. Only tell the client the case is
  // closed if the DB actually recorded it.
  const { error } = await supabase.rpc("admin_resolve_dispute", {
    p_dispute_id: disputeId,
    p_refunded: refunded,
  });
  if (error) {
    // Losing a race with the other admin surface is correct behaviour, but it
    // is otherwise invisible: the operator just sees the row change under them.
    console.error(`[admin] admin_resolve_dispute(${disputeId}) failed:`, error);
  }

  if (!error && !refunded && dispute?.booking_id) {
    await notifyDisputeDismissed(dispute.booking_id);
  }

  revalidateBoth();
}

/** Approve a talachero's submission. admin_review_talachero self-gates on
 * is_admin(); the RLS client is fine (mirrors setBan/deleteReview). p_reason has
 * a SQL default (null), so the generator marks it optional and we omit it — same
 * as resolveDispute omitting p_note. */
export async function approveTalachero(formData: FormData) {
  const talacheroId = String(formData.get("talacheroId") ?? "");
  const supabase = await createClient();
  await supabase.rpc("admin_review_talachero", {
    p_talachero_id: talacheroId,
    p_approve: true,
  });
  revalidatePath(`/${await getLocale()}/dashboard/admin/verifications`);
}

/** Reject a talachero's submission with a reason. Empty reason is rejected by
 * the RPC (empty_reason); the UI requires the field, so this is defensive. */
export async function rejectTalachero(formData: FormData) {
  const talacheroId = String(formData.get("talacheroId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const supabase = await createClient();
  await supabase.rpc("admin_review_talachero", {
    p_talachero_id: talacheroId,
    p_approve: false,
    p_reason: reason,
  });
  revalidatePath(`/${await getLocale()}/dashboard/admin/verifications`);
}
