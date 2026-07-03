import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { BookingStatus } from "@/lib/supabase/types";

export interface ClientBooking {
  id: string;
  status: BookingStatus;
  price: number | null;
  currency: string;
  address: string | null;
  createdAt: string;
  talacheroId: string;
  talacheroName: string | null;
  serviceSlug: string;
  slotStart: string | null;
}

export interface TalacheroBooking {
  id: string;
  status: BookingStatus;
  price: number | null;
  currency: string;
  address: string | null;
  createdAt: string;
  clientName: string | null;
  serviceSlug: string;
  slotStart: string | null;
}

/** Bookings the signed-in client has requested. */
export async function getMyBookings(): Promise<ClientBooking[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_bookings");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    price: r.price,
    currency: r.currency,
    address: r.address,
    createdAt: r.created_at,
    talacheroId: r.talachero_id,
    talacheroName: r.talachero_name,
    serviceSlug: r.service_slug,
    slotStart: r.slot_start,
  }));
}

/** Bookings addressed to the signed-in talachero. */
export async function getTalacheroBookings(): Promise<TalacheroBooking[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_talachero_bookings");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    price: r.price,
    currency: r.currency,
    address: r.address,
    createdAt: r.created_at,
    clientName: r.client_name,
    serviceSlug: r.service_slug,
    slotStart: r.slot_start,
  }));
}
