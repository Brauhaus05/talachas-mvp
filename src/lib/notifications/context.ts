import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { BookingFacts } from "./templates";

type Service = SupabaseClient<Database>;

export interface Party {
  name: string | null;
  email: string | null;
  locale: string;
}

export interface NotificationContext {
  client: Party;
  talachero: Party;
  booking: BookingFacts;
}

/**
 * Assemble everything the email templates need for a booking, via the
 * service-role client (recipient contact spans users own-row RLS). Returns null
 * if the booking or either party can't be resolved — callers no-op on null.
 */
export async function getNotificationContext(
  service: Service,
  bookingId: string
): Promise<NotificationContext | null> {
  const { data: booking } = await service
    .from("bookings")
    .select("client_id, talachero_id, service_category_id, slot_id, price, currency")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return null;

  const [{ data: clientUser }, { data: profile }, { data: category }, slotStart] =
    await Promise.all([
      service
        .from("users")
        .select("full_name, email, locale")
        .eq("id", booking.client_id)
        .maybeSingle(),
      service
        .from("talachero_profiles")
        .select("user_id")
        .eq("id", booking.talachero_id)
        .maybeSingle(),
      service
        .from("service_categories")
        .select("slug")
        .eq("id", booking.service_category_id)
        .maybeSingle(),
      booking.slot_id
        ? service
            .from("availability_slots")
            .select("start_time")
            .eq("id", booking.slot_id)
            .maybeSingle()
            .then((r) => r.data?.start_time ?? null)
        : Promise.resolve(null),
    ]);

  if (!profile) return null;
  const { data: talacheroUser } = await service
    .from("users")
    .select("full_name, email, locale")
    .eq("id", profile.user_id)
    .maybeSingle();

  return {
    client: {
      name: clientUser?.full_name ?? null,
      email: clientUser?.email ?? null,
      locale: clientUser?.locale ?? "es",
    },
    talachero: {
      name: talacheroUser?.full_name ?? null,
      email: talacheroUser?.email ?? null,
      locale: talacheroUser?.locale ?? "es",
    },
    booking: {
      serviceSlug: category?.slug ?? "handyman",
      slotStart,
      price: booking.price,
      currency: booking.currency,
    },
  };
}
