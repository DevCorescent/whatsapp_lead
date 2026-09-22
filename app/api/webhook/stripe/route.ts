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
import { applyPlanChange, claimStripeEvent } from "@/lib/billing/planChange";
import { prisma } from "@/lib/prisma";

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

  // Stripe delivers at least once. Two of the handlers below are not naturally
  // idempotent — resetAiUsage() grants a month of AI credits, and applying a plan
  // change moves a period end — so a redelivery is claimed once and then ignored.
  // The claim is an insert on Stripe's own event id, so the database is the lock.
  if (!(await claimStripeEvent(event.id, event.type))) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;

        // A prorated upgrade. The session carries only the PlanChange id; the
        // amount and the target plan are re-read from that row rather than taken
        // from the session, so a tampered or replayed session cannot move a
        // workspace onto a plan it did not pay for.
        const planChangeId = s.metadata?.planChangeId;
        if (planChangeId) {
          if (s.payment_status !== "paid") {
            console.warn("[STRIPE WEBHOOK] Session completed unpaid", {
              planChangeId,
              paymentStatus: s.payment_status,
            });
            break;
          }
          const paymentRef =
            typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null;
          const applied = await applyPlanChange(planChangeId, paymentRef);
          if (!applied.ok) {
            console.error("[STRIPE WEBHOOK] Could not apply paid plan change", {
              planChangeId,
              reason: applied.reason,
            });
          }
          break;
        }

        if (s.subscription) {
          const subId = typeof s.subscription === "string" ? s.subscription : s.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncStripeSubscription(sub);
        }
        break;
      }
      case "checkout.session.expired": {
        // The customer abandoned the payment page. The quote is closed so it cannot
        // be settled later at a price that has since gone stale; the plan is
        // untouched, which is the whole point — they keep what they had.
        const s = event.data.object as Stripe.Checkout.Session;
        const planChangeId = s.metadata?.planChangeId;
        if (planChangeId) {
          await prisma.planChange.updateMany({
            where: { id: planChangeId, status: "PENDING" },
            data: { status: "CANCELLED" },
          });
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
      case "payment_intent.payment_failed": {
        // A prorated upgrade whose card was declined. The quote is marked failed so
        // the customer is asked for a fresh one rather than settling an old price,
        // and the subscription is left exactly as it was.
        const intent = event.data.object as Stripe.PaymentIntent;
        const planChangeId = intent.metadata?.planChangeId;
        if (planChangeId) {
          await prisma.planChange.updateMany({
            where: { id: planChangeId, status: "PENDING" },
            data: { status: "FAILED" },
          });
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
