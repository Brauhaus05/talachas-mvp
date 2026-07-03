import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ServiceSlug } from "@/lib/mock/services";
import type { Talachero, TalacheroReview } from "@/lib/mock/talacheros";

/**
 * Data-access layer for talacheros. Reads through the SECURITY DEFINER RPCs
 * (list_talacheros / get_talachero_reviews) and maps rows into the `Talachero`
 * view shape the Phase 1 components already consume, so the UI is unchanged.
 */

type DirectoryRow = {
  id: string;
  full_name: string | null;
  neighborhood: string | null;
  hourly_rate: number | null;
  rating_avg: number | null;
  rating_count: number | null;
  jobs_completed: number | null;
  years_experience: number | null;
  bio: string | null;
  services: string[] | null;
  primary_service: string | null;
  available_today: boolean | null;
};

type ReviewRow = {
  id: string;
  author_name: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

function daysAgo(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function toTalachero(row: DirectoryRow, reviews: TalacheroReview[]): Talachero {
  const name = row.full_name ?? "";
  const services = (row.services ?? []) as ServiceSlug[];
  const primary = (row.primary_service ?? services[0] ?? "handyman") as ServiceSlug;
  const bio = row.bio ?? "";
  return {
    id: row.id,
    name,
    initials: initialsOf(name),
    neighborhood: row.neighborhood ?? "",
    services,
    primaryService: primary,
    hourlyRateMxn: Number(row.hourly_rate ?? 0),
    ratingAvg: Number(row.rating_avg ?? 0),
    ratingCount: row.rating_count ?? 0,
    jobsCompleted: row.jobs_completed ?? 0,
    yearsExperience: row.years_experience ?? 0,
    verified: true, // list_talacheros only returns verified profiles
    availableToday: row.available_today ?? false,
    // Single bio column in the DB serves both locales for now.
    bioEs: bio,
    bioEn: bio,
    reviews,
  };
}

function toReview(row: ReviewRow): TalacheroReview {
  const author = row.author_name ?? "";
  const comment = row.comment ?? "";
  return {
    id: row.id,
    authorName: author,
    authorInitials: initialsOf(author),
    rating: row.rating,
    daysAgo: daysAgo(row.created_at),
    bodyEs: comment,
    bodyEn: comment,
  };
}

export async function listTalacheros(): Promise<Talachero[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_talacheros", {});
  if (error) throw error;
  return ((data ?? []) as DirectoryRow[]).map((row) => toTalachero(row, []));
}

export interface MyTalacheroPayments {
  id: string;
  stripeAccountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

/** The signed-in talachero's own profile + Stripe onboarding state. */
export async function getMyTalacheroProfile(): Promise<MyTalacheroPayments | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("talachero_profiles")
    .select("id, stripe_account_id, charges_enabled, payouts_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return null;

  return {
    id: data.id,
    stripeAccountId: data.stripe_account_id,
    chargesEnabled: data.charges_enabled,
    payoutsEnabled: data.payouts_enabled,
  };
}

export interface TalacheroSlot {
  id: string;
  /** ISO timestamp (UTC) of the slot start. */
  startTime: string;
}

/** Open, future availability slots for a talachero, ordered by start time. */
export async function getTalacheroSlots(talacheroId: string): Promise<TalacheroSlot[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("availability_slots")
    .select("id, start_time")
    .eq("talachero_id", talacheroId)
    .eq("status", "open")
    .gte("start_time", new Date().toISOString())
    .order("start_time")
    .limit(80);
  if (error) throw error;
  return (data ?? []).map((s) => ({ id: s.id, startTime: s.start_time }));
}

export async function getTalacheroById(id: string): Promise<Talachero | null> {
  const supabase = await createClient();
  const [profile, reviews] = await Promise.all([
    supabase.rpc("list_talacheros", { p_id: id }),
    supabase.rpc("get_talachero_reviews", { p_id: id }),
  ]);
  if (profile.error) throw profile.error;
  const row = ((profile.data ?? []) as DirectoryRow[])[0];
  if (!row) return null;
  const mapped = ((reviews.data ?? []) as ReviewRow[]).map(toReview);
  return toTalachero(row, mapped);
}
