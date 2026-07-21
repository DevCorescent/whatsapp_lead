// ============================================================================
// ROUTE : /api/webhook/stripe  (POST)
//
// Stripe → app sync. Stripe is the source of truth for billing state; this
// endpoint keeps the DB Subscription row in step with it. Every event is
// signature-verified against STRIPE_WEBHOOK_SECRET over the RAW request body —
// an unsigned or tampered payload is rejected before anything is read.
//
// Handled events:
//   checkout.session.completed      → first subscription created
//   customer.subscription.created   → sync
//   customer.subscription.updated   → sync (upgrades, cancel scheduling, status)
//   customer.subscription.deleted   → sync (→ CANCELLED)
//   invoice.paid                    → sync + reset the period's AI credits
//   invoice.payment_failed          → sync (→ PAST_DUE)
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { syncStripeSubscription, resetAiUsage } from "@/lib/billing/subscription";

export const dynamic = "force-dynamic";

/** Read a subscription id off an invoice across Stripe API versions. */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const direct = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription;
  if (typeof direct === "string") return direct;
  if (direct && typeof direct === "object") return direct.id;
  const parent = (invoice as unknown as { parent?: { subscription_details?: { subscription?: string } } }).parent;
  return parent?.subscription_details?.subscription ?? null;
}

export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Billing not configured" }, { status: 400 });
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[STRIPE WEBHOOK] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const stripe = getStripe();
  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature ?? "", secret);
  } catch (error) {
    console.error("[STRIPE WEBHOOK] Signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.subscription) {
          const subId = typeof s.subscription === "string" ? s.subscription : s.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncStripeSubscription(sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncStripeSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoiceSubscriptionId(invoice);
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          const tenantId = await syncStripeSubscription(sub);
          if (tenantId) await resetAiUsage(tenantId); // new period → credits reset
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoiceSubscriptionId(invoice);
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncStripeSubscription(sub);
        }
        break;
      }
      default:
        // Unhandled event types are acknowledged so Stripe stops retrying them.
        break;
    }
  } catch (error) {
    console.error(`[STRIPE WEBHOOK] Error handling ${event.type}:`, error);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
