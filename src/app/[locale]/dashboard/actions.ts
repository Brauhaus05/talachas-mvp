"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

async function revalidateDashboards(locale: string) {
  revalidatePath(`/${locale}/dashboard`);
  revalidatePath(`/${locale}/dashboard/talachero`);
}

export async function acceptBooking(formData: FormData) {
  const id = String(formData.get("bookingId") ?? "");
  const supabase = await createClient();
  await supabase.rpc("respond_to_booking", {
    p_booking_id: id,
    p_accept: true,
  });
  await revalidateDashboards(await getLocale());
}

export async function rejectBooking(formData: FormData) {
  const id = String(formData.get("bookingId") ?? "");
  const supabase = await createClient();
  await supabase.rpc("respond_to_booking", {
    p_booking_id: id,
    p_accept: false,
  });
  await revalidateDashboards(await getLocale());
}

export async function cancelBooking(formData: FormData) {
  const id = String(formData.get("bookingId") ?? "");
  const supabase = await createClient();
  await supabase.rpc("cancel_booking", { p_booking_id: id });
  await revalidateDashboards(await getLocale());
}
