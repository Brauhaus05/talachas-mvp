import "server-only";
import { getStripe } from "./server";

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
