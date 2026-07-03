"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { createClient } from "@/lib/supabase/server";

export type ConfirmState = { status: "idle" } | { status: "error"; error: string };

function mapError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("slot_unavailable")) return "slot_unavailable";
  if (m.includes("slot_not_found")) return "slot_not_found";
  if (m.includes("not_authenticated")) return "not_authenticated";
  return "generic";
}

/**
 * Confirms a booking: resolves the service slug, then calls the concurrency-safe
 * create_booking RPC. Requires a signed-in client — anon callers are sent to
 * sign in first. On success, redirects to the client dashboard where the new
 * (pending) booking is listed.
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

  const { data: svc } = await supabase
    .from("service_categories")
    .select("id")
    .eq("slug", serviceSlug)
    .maybeSingle();
  if (!svc) {
    return { status: "error", error: "generic" };
  }

  const { error } = await supabase.rpc("create_booking", {
    p_talachero_id: talacheroId,
    p_slot_id: slotId,
    p_service_category_id: svc.id,
    p_hours: hours,
    p_address: address,
    p_notes: notes,
  });
  if (error) {
    return { status: "error", error: mapError(error.message) };
  }

  redirect(`/${locale}/dashboard?booked=1` as Route);
}
