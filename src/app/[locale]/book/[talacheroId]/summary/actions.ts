"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe/server";
import { getAppUrl, getPlatformFeePct } from "@/lib/stripe/config";

export type ConfirmState = { status: "idle" } | { status: "error"; error: string };

function mapError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("slot_unavailable")) return "slot_unavailable";
  if (m.includes("slot_not_found")) return "slot_not_found";
  if (m.includes("not_authenticated")) return "not_authenticated";
  return "generic";
}

/**
 * Confirms a booking and starts payment. Flow:
 *  1. require a signed-in client + a payable talachero (charges_enabled),
 *  2. create_booking (concurrency-safe; reserves the slot),
 *  3. open a Stripe Checkout Session — manual capture (funds are authorized
 *     now, captured on completion), 15% platform fee, transfer to the
 *     talachero's Connect account — and redirect the client to pay.
 *
 * The booking's payment_status flips to 'authorized' via the
 * checkout.session.completed webhook; abandoned sessions expire and the
 * checkout.session.expired webhook releases the slot.
 */
export async function confirmBooking(
  _prev: ConfirmState,
  formData: FormData
): Promise<ConfirmState> {
  const talacheroId = String(formData.get("talacheroId") ?? "");
  const slotId = String(formData.get("slotId") ?? "");
  const serviceSlug = String(formData.get("service") ?? "");
  const hours = Number(formData.get("hours")) || 1;
  const address = String(formData.get("address") ?? "");
  const notes = String(formData.get("description") ?? "");
  const locale = await getLocale();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/auth/sign-in` as Route);
  }

  const service = createServiceClient();

  // The talachero must have finished Stripe onboarding to be paid.
  const { data: tal } = await service
    .from("talachero_profiles")
    .select("stripe_account_id, charges_enabled")
    .eq("id", talacheroId)
    .maybeSingle();
  if (!tal?.charges_enabled || !tal.stripe_account_id) {
    return { status: "error", error: "talachero_not_payable" };
  }

  const { data: svc } = await supabase
    .from("service_categories")
    .select("id")
    .eq("slug", serviceSlug)
    .maybeSingle();
  if (!svc) {
    return { status: "error", error: "generic" };
  }

  const { data: bookingId, error } = await supabase.rpc("create_booking", {
    p_talachero_id: talacheroId,
    p_slot_id: slotId,
    p_service_category_id: svc.id,
    p_hours: hours,
    p_address: address,
    p_notes: notes,
  });
  if (error || !bookingId) {
    return { status: "error", error: error ? mapError(error.message) : "generic" };
  }

  const { data: booking } = await service
    .from("bookings")
    .select("price, currency")
    .eq("id", bookingId)
    .single();

  const amountMinor = Math.round(Number(booking?.price ?? 0) * 100);
  const feeMinor = Math.round(amountMinor * getPlatformFeePct());
  const currency = (booking?.currency ?? "MXN").toLowerCase();
  const appUrl = getAppUrl();

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    client_reference_id: bookingId,
    metadata: { booking_id: bookingId, kind: "booking" },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: amountMinor,
          product_data: { name: "Talachas — reserva" },
        },
      },
    ],
    payment_intent_data: {
      capture_method: "manual",
      application_fee_amount: feeMinor,
      transfer_data: { destination: tal.stripe_account_id },
      metadata: { booking_id: bookingId, kind: "booking" },
    },
    // Short expiry so abandoned bookings release their slot quickly.
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    success_url: `${appUrl}/${locale}/dashboard?paid=1`,
    cancel_url: `${appUrl}/${locale}/dashboard`,
  });

  if (!session.url) {
    return { status: "error", error: "generic" };
  }
  redirect(session.url as Route);
}
