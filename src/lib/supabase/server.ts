import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";
import type { Database } from "./types";

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers.
 * A fresh client per request — never cache or share it across requests.
 *
 * `setAll` throws when called from a Server Component (cookies are read-only
 * there); that's fine because the proxy (src/proxy.ts) already refreshes the
 * session on every request, so we swallow the error.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — the proxy handles the refresh.
        }
      },
    },
  });
}
