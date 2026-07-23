// ============================================================================
// ROUTE : /api/billing  (GET)
//
// The tenant's billing summary: current plan, subscription status, renewal,
// live usage metrics, and invoice history pulled from Stripe. Shaped to satisfy
// the existing Settings → Billing tab (planName / priceMonthly / renewsAt /
// usage.{contacts,messages,agents} / invoices) while carrying the extra fields
// the dedicated Billing page needs. Any authenticated tenant member may read it.
// ============================================================================

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUsage, resolveTenantPlan } from "@/lib/billing/usage";
import { isStripeConfigured, getStripe } from "@/lib/stripe";

interface InvoiceDTO {
  id: string;
  number: string;
  date: string;
  amount: number;
  status: string;
  url: string | null;
  pdf: string | null;
}

async function fetchInvoices(customerId: string | null | undefined): Promise<InvoiceDTO[]> {
  if (!customerId || !isStripeConfigured()) return [];
  try {
    const stripe = getStripe();
    const list = await stripe.invoices.list({ customer: customerId, limit: 24 });
    return list.data.map((inv) => ({
      id: inv.id ?? "",
      number: inv.number ?? inv.id ?? "—",
      date: new Date((inv.status_transitions?.paid_at ?? inv.created) * 1000).toISOString(),
      amount: (inv.amount_paid ?? inv.amount_due ?? 0) / 100,
      status: (inv.status ?? "open").toUpperCase() === "PAID" ? "PAID" : (inv.status ?? "OPEN").toUpperCase(),
      url: inv.hosted_invoice_url ?? null,
      pdf: inv.invoice_pdf ?? null,
    }));
  } catch (error) {
    console.error("[BILLING] Failed to list invoices:", error);
    return [];
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    const [{ subscription, planName }, usage] = await Promise.all([
      resolveTenantPlan(tenantId),
      getUsage(tenantId),
    ]);

    const invoices = await fetchInvoices(subscription?.stripeCustomerId);

    return NextResponse.json({
      planId: subscription?.planId ?? null,
      planName,
      priceMonthly: subscription?.plan.priceMonthly ?? 0,
      status: subscription?.status ?? "TRIALING",
      renewsAt: subscription?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      trialEndsAt: subscription?.trialEndsAt?.toISOString() ?? null,
      hasStripe: Boolean(subscription?.stripeCustomerId) && isStripeConfigured(),
      usage: {
        contacts: { label: "Contacts", ...usage.contacts },
        messages: { label: "Messages this month", ...usage.messages },
        agents: { label: "Agents", ...usage.users },
        campaigns: { label: "Campaigns this period", ...usage.campaigns },
        storage: { label: "Storage (MB)", ...usage.storageMb },
        ai: { label: "AI credits", ...usage.aiCredits },
      },
      invoices,
    });
  } catch (error) {
    console.error("[BILLING GET]", error);
    return NextResponse.json({ error: "Failed to load billing" }, { status: 500 });
  }
}
