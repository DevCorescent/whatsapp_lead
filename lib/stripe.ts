// ============================================================================
// MODULE : Stripe client
// ============================================================================
//
// A single lazily-constructed Stripe client, mirroring how lib/email.ts guards
// the Resend key. The secret key never leaves the server, and the client is only
// built when STRIPE_SECRET_KEY is present — so a deploy without billing configured
// fails with a friendly error instead of crashing at import time.

import Stripe from "stripe";

let client: Stripe | null = null;

export class StripeNotConfiguredError extends Error {
  constructor() {
    super("Billing is not configured. Add STRIPE_SECRET_KEY to enable payments.");
    this.name = "StripeNotConfiguredError";
  }
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Get the shared Stripe client, or throw StripeNotConfiguredError if no key. */
export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new StripeNotConfiguredError();
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY, {
      // Pin nothing — let the SDK use the version bundled with it (v22).
      typescript: true,
      appInfo: { name: "WhatsCRM Billing" },
    });
  }
  return client;
}

/** Absolute base URL for Stripe redirect (success/cancel/return) URLs. */
export function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}
