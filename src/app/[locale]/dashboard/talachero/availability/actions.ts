"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

export type ToggleResult = { ok: true; slotId: string } | { ok: false; error: string };

/** Map the RPCs' raised codes to a known, translatable set; anything else
 * collapses to "generic". Mirrors mapProfileError() in the profile action. */
const KNOWN = ["slot_booked", "out_of_range", "not_authorized"];
function mapToggleError(message: string): string {
  const m = message.toLowerCase();
  return KNOWN.find((code) => m.includes(code)) ?? "generic";
}

export async function openSlot(date: string, hour: number): Promise<ToggleResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_availability_slot", {
    p_date: date,
    p_hour: hour,
  });
  if (error) return { ok: false, error: mapToggleError(error.message) };
  const row = (data ?? [])[0] as { id: string } | undefined;
  if (!row) return { ok: false, error: "generic" };
  const locale = await getLocale();
  revalidatePath(`/${locale}/dashboard/talachero/availability`);
  return { ok: true, slotId: row.id };
}

export async function closeSlot(slotId: string): Promise<ToggleResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_availability_slot", {
    p_slot_id: slotId,
  });
  if (error) return { ok: false, error: mapToggleError(error.message) };
  const locale = await getLocale();
  revalidatePath(`/${locale}/dashboard/talachero/availability`);
  return { ok: true, slotId };
}
