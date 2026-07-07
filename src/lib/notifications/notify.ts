import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { getPlatformFeePct } from "@/lib/stripe/config";
import { getNotificationContext } from "./context";
import { sendEmail } from "./send";
import {
  bookingConfirmedEmail,
  paymentClientEmail,
  paymentTalacheroEmail,
  refundEmail,
  newReviewEmail,
} from "./templates";

/** → client, when the talachero accepts a request. */
export async function notifyBookingConfirmed(bookingId: string): Promise<void> {
  try {
    const ctx = await getNotificationContext(createServiceClient(), bookingId);
    if (!ctx) return;
    const email = bookingConfirmedEmail(
      ctx.client.locale,
      ctx.client.name,
      ctx.talachero.name,
      ctx.booking
    );
    await sendEmail({ to: ctx.client.email, ...email });
  } catch (err) {
    console.error(`[notifications] notifyBookingConfirmed(${bookingId}) failed:`, err);
  }
}

/** → client (receipt) + talachero (payout), on capture. */
export async function notifyPaymentCaptured(bookingId: string): Promise<void> {
  try {
    const ctx = await getNotificationContext(createServiceClient(), bookingId);
    if (!ctx) return;

    const clientEmail = paymentClientEmail(
      ctx.client.locale,
      ctx.client.name,
      ctx.talachero.name,
      ctx.booking
    );
    const net = Math.round((ctx.booking.price ?? 0) * (1 - getPlatformFeePct()) * 100) / 100;
    const talacheroEmail = paymentTalacheroEmail(
      ctx.talachero.locale,
      ctx.talachero.name,
      ctx.client.name,
      ctx.booking,
      net
    );

    await Promise.all([
      sendEmail({ to: ctx.client.email, ...clientEmail }),
      sendEmail({ to: ctx.talachero.email, ...talacheroEmail }),
    ]);
  } catch (err) {
    console.error(`[notifications] notifyPaymentCaptured(${bookingId}) failed:`, err);
  }
}

/** → client, on refund. */
export async function notifyRefundIssued(bookingId: string): Promise<void> {
  try {
    const ctx = await getNotificationContext(createServiceClient(), bookingId);
    if (!ctx) return;
    const email = refundEmail(
      ctx.client.locale,
      ctx.client.name,
      ctx.talachero.name,
      ctx.booking
    );
    await sendEmail({ to: ctx.client.email, ...email });
  } catch (err) {
    console.error(`[notifications] notifyRefundIssued(${bookingId}) failed:`, err);
  }
}

/** → talachero, when a client leaves a review. Reuses the booking context
 * (talachero = recipient, client = author). Best-effort; never throws. */
export async function notifyNewReview(bookingId: string, rating: number): Promise<void> {
  try {
    const ctx = await getNotificationContext(createServiceClient(), bookingId);
    if (!ctx) return;
    const email = newReviewEmail(
      ctx.talachero.locale,
      ctx.talachero.name,
      ctx.client.name,
      rating
    );
    await sendEmail({ to: ctx.talachero.email, ...email });
  } catch (err) {
    console.error(`[notifications] notifyNewReview(${bookingId}) failed:`, err);
  }
}
