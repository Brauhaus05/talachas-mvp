"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Route } from "next";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe/server";
import { getAppUrl, getConnectCountry } from "@/lib/stripe/config";

/**
 * Starts (or resumes) Stripe Connect Express onboarding for the signed-in
 * talachero: creates the account on first run, then a fresh account link, and
 * redirects to Stripe's hosted onboarding.
 */
export async function startOnboarding() {
  const locale = await getLocale();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/auth/sign-in` as Route);
  }

  const { data: profile } = await supabase
    .from("talachero_profiles")
    .select("id, stripe_account_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) {
    redirect(`/${locale}/dashboard/talachero` as Route);
  }

  const stripe = getStripe();
  let accountId = profile.stripe_account_id;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: getConnectCountry(),
      email: user.email ?? undefined,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });
    accountId = account.id;
    // service role: stripe_account_id is not writable by the talachero role.
    await createServiceClient()
      .from("talachero_profiles")
      .update({ stripe_account_id: accountId })
      .eq("id", profile.id);
  }

  const appUrl = getAppUrl();
  const dashboard = `${appUrl}/${locale}/dashboard/talachero`;
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: dashboard,
    return_url: dashboard,
    type: "account_onboarding",
  });

  redirect(link.url as Route);
}

/**
 * Pulls the latest capability flags from Stripe and syncs them onto the
 * profile. Complements the account.updated webhook for local dev where
 * webhooks may not be wired.
 */
export async function refreshOnboarding() {
  const locale = await getLocale();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/auth/sign-in` as Route);
  }

  const { data: profile } = await supabase
    .from("talachero_profiles")
    .select("id, stripe_account_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.stripe_account_id) {
    const account = await getStripe().accounts.retrieve(profile.stripe_account_id);
    const charges = Boolean(account.charges_enabled);
    const payouts = Boolean(account.payouts_enabled);
    // Payment readiness only; directory verification is admin-driven (see the
    // onboarding review flow), so we no longer set verification_status here.
    await createServiceClient()
      .from("talachero_profiles")
      .update({
        charges_enabled: charges,
        payouts_enabled: payouts,
      })
      .eq("id", profile.id);
  }

  revalidatePath(`/${locale}/dashboard/talachero`);
}
