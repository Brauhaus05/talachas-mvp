"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe/server";
import { getAppUrl } from "@/lib/stripe/config";

async function revalidateDashboards(locale: string) {
  revalidatePath(`/${locale}/dashboard`);
  revalidatePath(`/${locale}/dashboard/talachero`);
}

type BookingPayment = {
  stripe_payment_intent_id: string | null;
  payment_status: string;
  talachero_id: string;
};

async function bookingPayment(id: string): Promise<BookingPayment | null> {
  const { data } = await createServiceClient()
    .from("bookings")
    .select("stripe_payment_intent_id, payment_status, talachero_id")
    .eq("id", id)
    .maybeSingle();
  return data;
}

/** Best-effort Stripe call; never throw out of a form action for a payment
 * side effect (the webhook remains the source of truth for status/ledger). */
async function safe(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch {
    // swallow — status reconciles via webhook
  }
}

export async function acceptBooking(formData: FormData) {
  const id = String(formData.get("bookingId") ?? "");
  const supabase = await createClient();
  await supabase.rpc("respond_to_booking", { p_booking_id: id, p_accept: true });
  await revalidateDashboards(await getLocale());
}

export async function rejectBooking(formData: FormData) {
  const id = String(formData.get("bookingId") ?? "");
  const supabase = await createClient();
  await supabase.rpc("respond_to_booking", {
    p_booking_id: id,
    p_accept: false,
  });
  // Release the authorization hold, if any.
  const pay = await bookingPayment(id);
  if (pay?.stripe_payment_intent_id && pay.payment_status === "authorized") {
    await safe(() => getStripe().paymentIntents.cancel(pay.stripe_payment_intent_id!));
  }
  await revalidateDashboards(await getLocale());
}

export async function cancelBooking(formData: FormData) {
  const id = String(formData.get("bookingId") ?? "");
  const supabase = await createClient();
  await supabase.rpc("cancel_booking", { p_booking_id: id });

  const pay = await bookingPayment(id);
  const stripe = getStripe();
  if (pay?.stripe_payment_intent_id) {
    if (pay.payment_status === "authorized") {
      await safe(() => stripe.paymentIntents.cancel(pay.stripe_payment_intent_id!));
    } else if (pay.payment_status === "captured") {
      // Full refund of a completed booking: claw back the talachero's payout
      // (reverse_transfer) and return the platform commission
      // (refund_application_fee) so no party retains funds for a cancelled job.
      //
      // NOTE: this branch is currently UNREACHABLE via cancelBooking — capture
      // only happens at completion, and cancel_booking rejects 'completed'
      // (raises invalid_state). It is intentionally kept as the reference
      // implementation for the deferred Phase 6 ADMIN refund control (see
      // docs/superpowers/specs/2026-07-04-completed-booking-refund-design.md).
      // Do NOT delete as dead code. Tiered/partial refunds per cancellation
      // policy are still TODO — see HANDOFF "cancellation-policy time windows".
      await safe(() =>
        stripe.refunds.create({
          payment_intent: pay.stripe_payment_intent_id!,
          reverse_transfer: true,
          refund_application_fee: true,
        })
      );
    }
  }
  await revalidateDashboards(await getLocale());
}

export async function completeBooking(formData: FormData) {
  const id = String(formData.get("bookingId") ?? "");
  const supabase = await createClient();
  await supabase.rpc("complete_booking", { p_booking_id: id });

  // Capture the held funds; webhook records payment_status + ledger.
  const pay = await bookingPayment(id);
  if (pay?.stripe_payment_intent_id && pay.payment_status === "authorized") {
    await safe(() => getStripe().paymentIntents.capture(pay.stripe_payment_intent_id!));
  }
  await revalidateDashboards(await getLocale());
}

/** Client adds a tip on a completed booking — a separate charge that goes
 * entirely to the talachero (no platform fee). */
export async function tipBooking(formData: FormData) {
  const id = String(formData.get("bookingId") ?? "");
  const amount = Number(formData.get("amount")) || 0;
  const locale = await getLocale();
  if (amount <= 0) {
    redirect(`/${locale}/dashboard` as Route);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/auth/sign-in` as Route);
  }

  // Verify the caller owns this (completed) booking via RLS-scoped read.
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, talachero_id, currency, status, client_id")
    .eq("id", id)
    .maybeSingle();
  if (!booking || booking.status !== "completed") {
    redirect(`/${locale}/dashboard` as Route);
  }

  const { data: tal } = await createServiceClient()
    .from("talachero_profiles")
    .select("stripe_account_id, charges_enabled")
    .eq("id", booking.talachero_id)
    .maybeSingle();
  if (!tal?.charges_enabled || !tal.stripe_account_id) {
    redirect(`/${locale}/dashboard` as Route);
  }

  const appUrl = getAppUrl();
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    client_reference_id: id,
    metadata: { booking_id: id, kind: "tip" },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: booking.currency.toLowerCase(),
          unit_amount: Math.round(amount * 100),
          product_data: { name: "Talachas — propina" },
        },
      },
    ],
    payment_intent_data: {
      transfer_data: { destination: tal.stripe_account_id },
      metadata: { booking_id: id, kind: "tip" },
    },
    success_url: `${appUrl}/${locale}/dashboard?tipped=1`,
    cancel_url: `${appUrl}/${locale}/dashboard`,
  });

  if (!session.url) {
    redirect(`/${locale}/dashboard` as Route);
  }
  redirect(session.url as Route);
}
