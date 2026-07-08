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

/** Look up a booking and, if it's captured with a payment intent, issue a full
 * refund (best-effort). Returns true iff a refund was actually issued to Stripe.
 * The charge.refunded webhook reconciles payment_status + the ledger. Shared by
 * the admin force-refund and dispute-resolution paths. */
export async function refundBookingIfCaptured(bookingId: string): Promise<boolean> {
  const { data: booking } = await createServiceClient()
    .from("bookings")
    .select("stripe_payment_intent_id, payment_status")
    .eq("id", bookingId)
    .maybeSingle();
  if (booking?.payment_status !== "captured" || !booking.stripe_payment_intent_id) {
    return false;
  }
  try {
    await refundCapturedBooking(booking.stripe_payment_intent_id);
    return true;
  } catch {
    return false;
  }
}
