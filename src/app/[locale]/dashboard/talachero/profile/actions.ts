"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

export type ProfileState = {
  status: "idle" | "success" | "error";
  error?: string;
};

/** Map update_talachero_profile's raised codes to a known, translatable set;
 * anything unexpected collapses to "generic". `no_profile` shouldn't surface
 * behind the role guard, so it also collapses to generic. Mirrors
 * mapReviewError() in the review action. */
function mapProfileError(message: string): string {
  const known = [
    "bio_too_long",
    "rate_out_of_range",
    "experience_invalid",
    "no_service",
    "primary_not_selected",
  ];
  const m = message.toLowerCase();
  return known.find((code) => m.includes(code)) ?? "generic";
}

export async function updateTalacheroProfile(
  _prev: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const bio = String(formData.get("bio") ?? "");
  const hourlyRate = Number(formData.get("hourlyRate"));
  const yearsRaw = formData.get("yearsExperience");
  const yearsExperience =
    yearsRaw === null || String(yearsRaw).trim() === "" ? null : Number(yearsRaw);
  const services = formData.getAll("services").map(String);
  const primary = String(formData.get("primary") ?? "");
  const locale = await getLocale();

  // Fast mirror of the RPC's validation so obvious cases skip the round-trip.
  if (!Number.isFinite(hourlyRate) || hourlyRate < 50 || hourlyRate > 2000) {
    return { status: "error", error: "rate_out_of_range" };
  }
  if (services.length === 0) {
    return { status: "error", error: "no_service" };
  }
  if (!primary || !services.includes(primary)) {
    return { status: "error", error: "primary_not_selected" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_talachero_profile", {
    p_bio: bio,
    p_hourly_rate: hourlyRate,
    // The type generator emits p_years_experience as `number`, but the RPC
    // accepts NULL (unset experience). Cast preserves that null at runtime.
    p_years_experience: yearsExperience as number,
    p_service_slugs: services,
    p_primary_slug: primary,
  });

  if (error) {
    return { status: "error", error: mapProfileError(error.message) };
  }

  revalidatePath(`/${locale}/dashboard/talachero/profile`);
  return { status: "success" };
}
