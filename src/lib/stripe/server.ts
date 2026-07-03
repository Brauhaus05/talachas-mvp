import "server-only";
import Stripe from "stripe";
import { getStripeSecretKey } from "./config";

// API version pinned to the one the installed SDK (stripe@22) targets.
const API_VERSION = "2026-06-24.dahlia";

let client: Stripe | null = null;

/** Lazily-constructed shared Stripe client (server-only). */
export function getStripe(): Stripe {
  if (!client) {
    client = new Stripe(getStripeSecretKey(), { apiVersion: API_VERSION });
  }
  return client;
}
