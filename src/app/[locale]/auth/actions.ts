"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { createClient } from "@/lib/supabase/server";

export type AuthState =
  { status: "idle" } | { status: "error"; error: string } | { status: "confirm_email" };

/**
 * The signup form sends `role` as one of these; anything else is coerced to
 * `client` by the database trigger, and `admin` can never be self-assigned.
 */
const SIGNUP_ROLES = ["client", "talachero"] as const;
type SignupRole = (typeof SIGNUP_ROLES)[number];

function normalizeRole(value: FormDataEntryValue | null): SignupRole {
  return SIGNUP_ROLES.includes(value as SignupRole) ? (value as SignupRole) : "client";
}

/** Map Supabase auth errors to i18n keys the client can render. */
function errorCode(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "email_taken";
  }
  if (m.includes("invalid login") || m.includes("invalid credentials")) {
    return "invalid_credentials";
  }
  if (m.includes("password")) return "weak_password";
  if (m.includes("email")) return "invalid_email";
  return "generic";
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { status: "error", error: errorCode(error.message) };
  }

  const locale = await getLocale();
  redirect(`/${locale}/dashboard` as Route);
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = normalizeRole(formData.get("role"));
  const locale = await getLocale();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { role, full_name: fullName, locale },
    },
  });

  if (error) {
    return { status: "error", error: errorCode(error.message) };
  }

  // When email confirmation is enabled there is no session yet — tell the user
  // to check their inbox. Locally confirmations are off, so we get a session
  // and can go straight to the dashboard.
  if (!data.session) {
    return { status: "confirm_email" };
  }

  redirect(`/${locale}/dashboard` as Route);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const locale = await getLocale();
  redirect(`/${locale}` as Route);
}
