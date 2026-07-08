"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

export type DisputeState = { error?: string };

/** Map raise_dispute's raised codes to a known, translatable set; anything
 * unexpected collapses to "generic". Mirrors mapReviewError(). */
function mapDisputeError(message: string): string {
  const known = [
    "not_refundable",
    "already_disputed",
    "booking_not_completed",
    "not_your_booking",
    "booking_not_found",
    "empty_reason",
    "not_authenticated",
  ];
  const m = message.toLowerCase();
  return known.find((code) => m.includes(code)) ?? "generic";
}

/** Client raises a dispute on a completed+captured booking. On success:
 * redirect to the dashboard with ?disputed=1. On failure: return a typed error
 * code the form localizes. Once the page guard has passed, the reachable codes
 * are not_refundable / already_disputed / generic, plus empty_reason — a
 * whitespace-only reason satisfies the textarea's `required` but fails the
 * server trim check below. */
export async function raiseDispute(
  _prev: DisputeState,
  formData: FormData
): Promise<DisputeState> {
  const bookingId = String(formData.get("bookingId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const locale = await getLocale();

  if (reason.trim() === "") {
    return { error: "empty_reason" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("raise_dispute", {
    p_booking_id: bookingId,
    p_reason: reason,
  });

  if (error) {
    return { error: mapDisputeError(error.message) };
  }

  revalidatePath(`/${locale}/dashboard`);
  redirect(`/${locale}/dashboard?disputed=1` as Route);
}
