import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPlatformFeePct } from "@/lib/stripe/config";
import type { ServiceSlug } from "@/lib/mock/services";
import type { Talachero, TalacheroReview } from "@/lib/mock/talacheros";
import type { VerificationStatus } from "@/lib/supabase/types";

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

export interface AvailabilitySlotView {
  id: string;
  /** CDMX civil date, YYYY-MM-DD. */
  date: string;
  /** CDMX hour of day, 0–23. */
  hour: number;
  status: "open" | "booked";
}

const AVAIL_TZ = "America/Mexico_City";
const cdmxDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: AVAIL_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const cdmxHourFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: AVAIL_TZ,
  hour: "2-digit",
  hour12: false,
});

/**
 * The signed-in talachero's own slots (open + booked) within the next ~14 days,
 * shaped for the availability grid. `blocked` slots are excluded (unused).
 * Returns [] if the caller isn't a talachero / has no profile.
 */
export async function getMyAvailability(): Promise<AvailabilitySlotView[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from("talachero_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) return [];

  const now = new Date();
  const horizon = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
  const { data, error } = await supabase
    .from("availability_slots")
    .select("id, start_time, status")
    .eq("talachero_id", profile.id)
    .in("status", ["open", "booked"])
    .gte("start_time", now.toISOString())
    .lt("start_time", horizon.toISOString())
    .order("start_time");
  if (error) throw error;

  return (data ?? []).map((s) => {
    const d = new Date(s.start_time);
    return {
      id: s.id,
      date: cdmxDateFmt.format(d), // "2026-07-22"
      hour: Number(cdmxHourFmt.format(d)), // 8..19
      status: s.status as "open" | "booked",
    };
  });
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

export interface MyTalacheroProfileEdit {
  bio: string;
  hourlyRate: number | null;
  yearsExperience: number | null;
  services: ServiceSlug[];
  primaryService: ServiceSlug | null;
}

/**
 * The signed-in talachero's own editable profile: core fields + selected
 * services. Reads the caller's own row directly (RLS SELECT allows
 * user_id = auth.uid(); talachero_services + service_categories are public
 * read). Returns null if the caller has no profile.
 */
export async function getMyTalacheroProfileForEdit(): Promise<MyTalacheroProfileEdit | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("talachero_profiles")
    .select(
      "bio, hourly_rate, years_experience, talachero_services(is_primary, service_categories(slug))"
    )
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const rows = (data.talachero_services ?? []) as Array<{
    is_primary: boolean;
    service_categories: { slug: string } | null;
  }>;
  const services = rows
    .map((r) => r.service_categories?.slug)
    .filter((s): s is string => Boolean(s)) as ServiceSlug[];
  const primaryService = (rows.find((r) => r.is_primary)?.service_categories?.slug ??
    null) as ServiceSlug | null;

  return {
    bio: data.bio ?? "",
    hourlyRate: data.hourly_rate === null ? null : Number(data.hourly_rate),
    yearsExperience: data.years_experience,
    services,
    primaryService,
  };
}

export interface OnboardingStatus {
  status: VerificationStatus;
  rejectionReason: string | null;
  profileComplete: boolean;
  hasAvailability: boolean;
  chargesEnabled: boolean;
}

/**
 * The signed-in talachero's onboarding state for the dashboard checklist:
 * verification status + whether each step is done. `profileComplete` = rate set
 * and >=1 service; `hasAvailability` = >=1 upcoming open slot. Returns null if
 * the caller has no profile.
 */
export async function getMyOnboardingStatus(): Promise<OnboardingStatus | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("talachero_profiles")
    .select("id, verification_status, rejection_reason, hourly_rate, charges_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) return null;

  const [{ count: serviceCount }, { count: slotCount }] = await Promise.all([
    supabase
      .from("talachero_services")
      .select("talachero_id", { count: "exact", head: true })
      .eq("talachero_id", profile.id),
    supabase
      .from("availability_slots")
      .select("id", { count: "exact", head: true })
      .eq("talachero_id", profile.id)
      .eq("status", "open")
      .gte("start_time", new Date().toISOString()),
  ]);

  return {
    status: profile.verification_status,
    rejectionReason: profile.rejection_reason,
    profileComplete: profile.hourly_rate !== null && (serviceCount ?? 0) > 0,
    hasAvailability: (slotCount ?? 0) > 0,
    chargesEnabled: profile.charges_enabled,
  };
}

export interface EarningRow {
  bookingId: string;
  clientName: string;
  serviceSlug: string;
  /** ISO timestamp of the job (slot start, or booking creation). */
  date: string;
  currency: string;
  gross: number;
  commission: number;
  tip: number;
  net: number;
  refunded: boolean;
}

export interface EarningsView {
  rows: EarningRow[];
  summary: { totalNet: number; thisMonthNet: number; jobCount: number };
}

const EARN_TZ = "America/Mexico_City";
const cdmxMonthFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: EARN_TZ,
  year: "numeric",
  month: "2-digit",
});

/**
 * The signed-in talachero's earnings: one row per booking with ledger activity,
 * with net = charge×(1−fee) + tips (0 charge-portion if refunded), plus a small
 * summary. The 15% fee is applied server-side (env is not public). Degrades to
 * an empty view on error so the page never throws.
 */
export async function getMyEarnings(): Promise<EarningsView> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_earnings");
  if (error) {
    console.error("getMyEarnings failed:", error.message);
    return { rows: [], summary: { totalNet: 0, thisMonthNet: 0, jobCount: 0 } };
  }

  const fee = getPlatformFeePct();
  const rows: EarningRow[] = (data ?? []).map((r) => {
    const gross = Number(r.charge_gross ?? 0);
    const tip = Number(r.tip_total ?? 0);
    const refunded = Number(r.refund_total ?? 0) > 0;
    const commission = refunded ? 0 : gross * fee;
    const net = refunded ? tip : gross * (1 - fee) + tip;
    return {
      bookingId: r.booking_id,
      clientName: r.client_name ?? "",
      serviceSlug: r.service_slug,
      date: r.booking_date,
      currency: r.currency,
      gross,
      commission,
      tip,
      net,
      refunded,
    };
  });

  const thisMonth = cdmxMonthFmt.format(new Date());
  const summary = {
    totalNet: rows.reduce((acc, r) => acc + r.net, 0),
    thisMonthNet: rows
      .filter((r) => cdmxMonthFmt.format(new Date(r.date)) === thisMonth)
      .reduce((acc, r) => acc + r.net, 0),
    jobCount: rows.filter((r) => !r.refunded && r.gross > 0).length,
  };

  return { rows, summary };
}
