import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getServiceRoleKey, getSupabaseUrl } from "./config";
import type { Database } from "./types";

/**
 * Supabase client authenticated with the service-role key. Bypasses RLS —
 * use ONLY for trusted server-side writes (Stripe onboarding + webhook), never
 * in response to unvalidated user input. No session/cookie handling.
 */
export function createServiceClient() {
  return createClient<Database>(getSupabaseUrl(), getServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
