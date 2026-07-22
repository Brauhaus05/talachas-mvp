"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

export type SubmitState = {
  status: "idle" | "success" | "error";
  error?: string;
};

/** Map submit_talachero_for_review's raised codes to a translatable set;
 * anything unexpected collapses to "generic". Mirrors mapProfileError(). */
function mapSubmitError(message: string): string {
  const known = [
    "profile_incomplete",
    "no_availability",
    "already_submitted",
    "already_verified",
  ];
  const m = message.toLowerCase();
  return known.find((code) => m.includes(code)) ?? "generic";
}

export async function submitForReview(
  _prev: SubmitState,
  _formData: FormData
): Promise<SubmitState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_talachero_for_review");
  if (error) {
    return { status: "error", error: mapSubmitError(error.message) };
  }
  revalidatePath(`/${await getLocale()}/dashboard/talachero`);
  return { status: "success" };
}
