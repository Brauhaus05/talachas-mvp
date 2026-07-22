import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { UserRole, DisputeStatus } from "@/lib/supabase/types";

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
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

export interface AdminDispute {
  id: string;
  bookingId: string;
  clientName: string;
  talacheroName: string;
  price: number;
  currency: string;
  paymentStatus: string;
  reason: string;
  status: DisputeStatus;
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AdminVerification {
  talacheroId: string;
  fullName: string;
  bio: string | null;
  hourlyRate: number;
  currency: string;
  serviceSlugs: string[];
  slotCount: number;
  chargesEnabled: boolean;
  submittedAt: string | null;
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

export async function listDisputes(): Promise<AdminDispute[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_list_disputes");
  return (data ?? []).map((r) => ({
    id: r.id,
    bookingId: r.booking_id,
    clientName: r.client_name ?? "",
    talacheroName: r.talachero_name ?? "",
    price: Number(r.price ?? 0),
    currency: r.currency,
    paymentStatus: r.payment_status,
    reason: r.reason,
    status: r.status,
    adminNote: r.admin_note,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  }));
}

export async function getVerificationQueue(): Promise<AdminVerification[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_list_verifications");
  return (data ?? []).map((r) => ({
    talacheroId: r.talachero_id,
    fullName: r.full_name ?? "",
    bio: r.bio,
    hourlyRate: Number(r.hourly_rate ?? 0),
    currency: r.currency,
    serviceSlugs: r.service_slugs ?? [],
    slotCount: Number(r.slot_count ?? 0),
    chargesEnabled: r.charges_enabled,
    submittedAt: r.submitted_at,
  }));
}
