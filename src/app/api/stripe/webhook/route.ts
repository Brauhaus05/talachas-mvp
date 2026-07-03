import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/server";
import { getStripeWebhookSecret } from "@/lib/stripe/config";
import { createServiceClient } from "@/lib/supabase/service";

// Stripe SDK needs the Node runtime and the raw request body for signature
// verification.
export const runtime = "nodejs";

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

  // Idempotency: the event id is the primary key of stripe_events. If it's
  // already there, this is a Stripe retry — acknowledge without reprocessing.
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
    // Payment events (checkout.session.completed, payment_intent.*,
    // charge.refunded) are handled in the payments milestone (4B).
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
