import { createClient } from "@/lib/supabase/server";

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  banned: boolean;
}
export interface AdminBooking {
  id: string;
  clientName: string;
  talacheroName: string;
  price: number;
  currency: string;
  paymentStatus: string;
  createdAt: string;
}
export interface AdminReview {
  id: string;
  authorName: string;
  targetName: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export async function listUsers(): Promise<AdminUser[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_list_users");
  return (data ?? []).map((r) => ({
    id: r.id,
    email: r.email ?? "",
    fullName: r.full_name ?? "",
    role: r.role,
    banned: r.banned,
  }));
}

export async function listRefundableBookings(): Promise<AdminBooking[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_list_bookings");
  return (data ?? []).map((r) => ({
    id: r.id,
    clientName: r.client_name ?? "",
    talacheroName: r.talachero_name ?? "",
    price: Number(r.price ?? 0),
    currency: r.currency,
    paymentStatus: r.payment_status,
    createdAt: r.created_at,
  }));
}

export async function listReviews(): Promise<AdminReview[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_list_reviews");
  return (data ?? []).map((r) => ({
    id: r.id,
    authorName: r.author_name ?? "",
    targetName: r.target_name ?? "",
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at,
  }));
}
