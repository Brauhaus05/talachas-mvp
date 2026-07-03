import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/supabase/types";

export interface AppUser {
  id: string;
  email: string | null;
  role: UserRole;
  fullName: string | null;
  locale: string;
}

/**
 * The authoritative "who is signed in" check for Server Components and layouts.
 * Combines the validated auth user with their application row (which carries
 * the role). Returns null when signed out or when the profile row is missing.
 */
export async function getAppUser(): Promise<AppUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("role, full_name, locale, email")
    .eq("id", user.id)
    .single();

  if (!data) return null;

  return {
    id: user.id,
    email: data.email ?? user.email ?? null,
    role: data.role,
    fullName: data.full_name,
    locale: data.locale,
  };
}

/** Where each role's dashboard lives (locale-relative, for next-intl nav). */
export function dashboardPathForRole(role: UserRole): string {
  switch (role) {
    case "talachero":
      return "/dashboard/talachero";
    case "admin":
      return "/dashboard/admin";
    default:
      return "/dashboard";
  }
}
