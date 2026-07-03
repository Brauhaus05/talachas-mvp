import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "./config";
import type { Database } from "./types";

/**
 * Refreshes the Supabase auth session and writes any rotated tokens onto the
 * response the caller already built (here, the next-intl routing response).
 *
 * Attaching cookies to an existing response — rather than creating a new one —
 * is what lets Supabase auth and next-intl locale routing coexist in a single
 * proxy pass. Returns the validated user so the proxy can gate routes.
 */
export async function updateSession(
  request: NextRequest,
  response: NextResponse
): Promise<User | null> {
  const supabase = createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Responses that set auth cookies must never be cached — apply the
        // no-store headers the library provides.
        if (headers) {
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        }
      },
    },
  });

  // getUser() revalidates the JWT against the auth server and triggers a token
  // refresh (written back via setAll) when needed. Do not remove.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}
