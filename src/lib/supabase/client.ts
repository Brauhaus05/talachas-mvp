import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "./config";
import type { Database } from "./types";

/**
 * Supabase client for Client Components (runs in the browser). Safe to call on
 * every render — @supabase/ssr memoizes the singleton internally.
 */
export function createClient() {
  return createBrowserClient<Database>(getSupabaseUrl(), getSupabaseAnonKey());
}
