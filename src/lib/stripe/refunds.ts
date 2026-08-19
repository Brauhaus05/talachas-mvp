import "server-only";
import { getStripe } from "./server";
import { createServiceClient } from "@/lib/supabase/service";

/** Full refund of a captured booking: claw back the talachero's payout
 * (reverse_transfer) and return the platform commission (refund_application_fee)
 * so no party retains funds. The charge.refunded webhook reconciles
 * payment_status + the ledger. Assumes a FULL refund (partial/tiered refunds
 * per cancellation policy are still TODO). */
export async function refundCapturedBooking(paymentIntentId: string) {
  await getStripe().refunds.create({
    payment_intent: paymentIntentId,
    reverse_transfer: true,
    refund_application_fee: true,
  });
}

/** Outcome of an attempted refund. `already_refunded` is split out from the
 * failure cases deliberately: nothing is owed to Stripe, but a dispute on that
 * booking should still close as refunded. Collapsing it into a bare `false` is
 * what made the disputes-queue "Reembolsar" button a silent no-op. */
export type RefundOutcome = "refunded" | "already_refunded" | "not_refundable" | "error";

/** Stripe rejects a second full refund of the same charge. That rejection means
 * the money is already back with the client — a force-refund or a refund issued
 * from the Stripe dashboard landed inside the charge.refunded webhook lag — so
 * it must map to already_refunded. Mapping it to "error" is what left the
 * disputes-queue button doing nothing during that window.
 *
 * Matches on the error CODE only, deliberately. stripe-node copies the API
 * error code onto the thrown StripeError, so this is exact. A message-text
 * fallback was considered and rejected: it adds no coverage this code check
 * misses, and a message like "Application fee ... has already been refunded"
 * would misclassify a non-refund as already_refunded — marking a dispute
 * refunded while the client's money is still gone, the worst outcome here. */
function isAlreadyRefundedError(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "charge_already_refunded";
}

/** Look up a booking and, if it's captured with a payment intent, issue a full
 * refund (best-effort). The charge.refunded webhook reconciles payment_status +
 * the ledger. Shared by the admin force-refund and dispute-resolution paths. */
export async function refundBookingIfCaptured(bookingId: string): Promise<RefundOutcome> {
  const { data: booking } = await createServiceClient()
    .from("bookings")
    .select("stripe_payment_intent_id, payment_status")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return "not_refundable";
  if (booking.payment_status === "refunded") return "already_refunded";
  if (booking.payment_status !== "captured" || !booking.stripe_payment_intent_id) {
    return "not_refundable";
  }
  try {
    await refundCapturedBooking(booking.stripe_payment_intent_id);
    return "refunded";
  } catch (err) {
    if (isAlreadyRefundedError(err)) return "already_refunded";
    console.error(`[refunds] refundBookingIfCaptured(${bookingId}) failed:`, err);
    return "error";
  }
}
