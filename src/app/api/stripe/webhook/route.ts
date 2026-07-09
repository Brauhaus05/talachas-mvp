import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe/server";
import { getStripeWebhookSecret } from "@/lib/stripe/config";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/types";
import { notifyPaymentCaptured, notifyRefundIssued } from "@/lib/notifications/notify";

// Stripe SDK needs the Node runtime and the raw request body for signature
// verification.
export const runtime = "nodejs";

type Service = SupabaseClient<Database>;

function minorToMajor(amount: number | null | undefined): number {
  return Math.round(((amount ?? 0) / 100) * 100) / 100;
}

async function ledger(
  service: Service,
  bookingId: string,
  type: Database["public"]["Enums"]["transaction_type"],
  amountMinor: number | null | undefined,
  currency: string | null | undefined,
  providerRef: string | null
) {
  await service.from("transactions").insert({
    booking_id: bookingId,
    type,
    amount: minorToMajor(amountMinor),
    currency: (currency ?? "cad").toUpperCase(),
    provider_ref: providerRef,
  });
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new NextResponse("Missing stripe-signature", { status: 400 });
  }

  const body = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, getStripeWebhookSecret());
  } catch {
    return new NextResponse("Invalid signature", { status: 400 });
  }

  const service = createServiceClient();

  // Idempotency: event id is the primary key of stripe_events. A duplicate
  // insert means this is a Stripe retry — acknowledge without reprocessing.
  const { error: dedupeError } = await service
    .from("stripe_events")
    .insert({ id: event.id, type: event.type });
  if (dedupeError) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  switch (event.type) {
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      const charges = Boolean(account.charges_enabled);
      const payouts = Boolean(account.payouts_enabled);
      await service
        .from("talachero_profiles")
        .update({
          charges_enabled: charges,
          payouts_enabled: payouts,
          verification_status: charges && payouts ? "verified" : "pending",
        })
        .eq("stripe_account_id", account.id);
      break;
    }

    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.metadata?.booking_id;
      const kind = session.metadata?.kind;
      const pi =
        typeof session.payment_intent === "string" ? session.payment_intent : null;
      if (bookingId && pi) {
        if (kind === "tip") {
          await service
            .from("bookings")
            .update({ tip_payment_intent_id: pi })
            .eq("id", bookingId);
        } else {
          // Booking payment authorized (manual capture → requires_capture).
          await service
            .from("bookings")
            .update({
              stripe_payment_intent_id: pi,
              payment_status: "authorized",
            })
            .eq("id", bookingId);
        }
      }
      break;
    }

    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.metadata?.booking_id;
      // Only release still-unpaid bookings; leave anything already authorized.
      if (bookingId && session.metadata?.kind !== "tip") {
        const { data: booking } = await service
          .from("bookings")
          .select("slot_id, payment_status, status")
          .eq("id", bookingId)
          .maybeSingle();
        if (booking && booking.payment_status === "none") {
          await service
            .from("bookings")
            .update({ status: "cancelled" })
            .eq("id", bookingId);
          if (booking.slot_id) {
            await service
              .from("availability_slots")
              .update({ status: "open" })
              .eq("id", booking.slot_id);
          }
        }
      }
      break;
    }

    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const bookingId = pi.metadata?.booking_id;
      const kind = pi.metadata?.kind;
      if (bookingId) {
        if (kind === "tip") {
          await ledger(service, bookingId, "tip", pi.amount, pi.currency, pi.id);
        } else {
          await service
            .from("bookings")
            .update({ payment_status: "captured" })
            .eq("id", bookingId);
          await ledger(
            service,
            bookingId,
            "charge",
            pi.amount_received,
            pi.currency,
            pi.id
          );
          await notifyPaymentCaptured(bookingId);
        }
      }
      break;
    }

    case "payment_intent.canceled": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const bookingId = pi.metadata?.booking_id;
      if (bookingId && pi.metadata?.kind !== "tip") {
        await service
          .from("bookings")
          .update({ payment_status: "none" })
          .eq("id", bookingId);
      }
      break;
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
      if (pi) {
        const { data: booking } = await service
          .from("bookings")
          .select("id")
          .eq("stripe_payment_intent_id", pi)
          .maybeSingle();
        if (booking) {
          await service
            .from("bookings")
            .update({ payment_status: "refunded" })
            .eq("id", booking.id);
          await ledger(
            service,
            booking.id,
            "refund",
            charge.amount_refunded,
            charge.currency,
            charge.id
          );
          await notifyRefundIssued(booking.id);
        }
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
