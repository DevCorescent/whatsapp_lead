// ROUTE : /api/admin/tenants/[id]/subscription  (GET · PUT) — SUPER_ADMIN only.
//
// Assigning a negotiated plan is not the same operation as switching tier in the
// billing UI, which is why it does not live on the tenant PATCH. A custom deal
// carries its own terms — when the period ends, whether it is a trial, whether
// it is billed monthly or annually — and the admin has to be able to set them.
// The tenant PATCH could only ever hardcode "ACTIVE, thirty days from now".
//
// No Stripe call is made. A custom tier is invoiced offline, so this route is
// the whole billing arrangement: the row it writes is what the enforcement layer
// reads, and the period end is whatever the contract says.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUsage } from "@/lib/billing/usage";
import { planOverages, type UsedCounts } from "@/lib/billing/overage";
import { recordBillingAudit } from "@/lib/billing/audit";
import { periodError, resolvePeriod, resolveTrialEnd } from "@/lib/billing/period";

type Params = { params: Promise<{ id: string }> };

const assignSchema = z.object({
  planId: z.string().min(1),
  status: z.enum(["ACTIVE", "TRIALING", "PAST_DUE", "CANCELLED", "EXPIRED"]).default("ACTIVE"),
  billingCycle: z.enum(["MONTHLY", "ANNUAL"]).default("MONTHLY"),
  currentPeriodStart: z.coerce.date().optional(),
  currentPeriodEnd: z.coerce.date().optional(),
  trialEndsAt: z.coerce.date().nullable().optional(),
  cancelAtPeriodEnd: z.boolean().optional(),
  /**
   * Zero the AI-credit counter as part of the move.
   *
   * A new deal usually means a new allowance, but not always — an admin fixing a
   * typo in the period end is not granting a fresh month of credits. So it is
   * asked for explicitly rather than inferred from whether the plan changed.
   */
  resetUsage: z.boolean().default(false),
});

/** Flatten getUsage() to the used-counts shape the overage check consumes. */
function usedCounts(usage: Awaited<ReturnType<typeof getUsage>>): UsedCounts {
  return {
    users: usage.users.used,
    contacts: usage.contacts.used,
    campaigns: usage.campaigns.used,
    storageMb: usage.storageMb.used,
    aiCredits: usage.aiCredits.used,
    businesses: usage.businesses.used,
    knowledgeDocs: usage.knowledgeDocs.used,
    messages: usage.messages.used,
    templates: usage.templates.used,
    quickReplies: usage.quickReplies.used,
  };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true } });
  if (!tenant) return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 });

  const [subscription, usage] = await Promise.all([
    prisma.subscription.findUnique({ where: { tenantId: id }, include: { plan: true } }),
    getUsage(id),
  ]);

  // The raw counts, not the current plan's headroom. The admin panel compares
  // them against whichever plan is selected in the dropdown, which is a
  // different plan from the one these numbers were metered under.
  return NextResponse.json({ success: true, data: { subscription, used: usedCounts(usage) } });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!tenant) return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  }
  const input = parsed.data;

  const plan = await prisma.plan.findUnique({ where: { id: input.planId } });
  if (!plan) return NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 });

  // A plan built for one customer must not be handed to another. This is the one
  // rule an admin cannot waive, because the whole point of an owned custom tier
  // is that its price belongs to a single negotiation. An unowned private tier
  // is fair game — that is what it is for.
  if (plan.ownerTenantId && plan.ownerTenantId !== id) {
    return NextResponse.json(
      { success: false, error: "That custom plan belongs to a different workspace. Clone it for this one instead." },
      { status: 409 },
    );
  }

  const existing = await prisma.subscription.findUnique({ where: { tenantId: id } });

  // An offline-invoiced plan is one Stripe has no price for, so Stripe cannot be
  // the source of truth for it. Locking says so explicitly, and it is what stops
  // the next invoice.paid quietly writing the old plan back — see planLockedAt
  // in the schema and the guard in syncStripeSubscription.
  const offlineInvoiced = !plan.stripePriceId;

  const warnings: string[] = [];
  if (existing?.stripeSubId) {
    warnings.push(
      offlineInvoiced
        ? `This workspace still has a live Stripe subscription (${existing.stripeSubId}). It has NOT been cancelled — cancel it in Stripe or they will keep being charged for the old plan alongside this one.`
        : `Stripe still bills this workspace on subscription ${existing.stripeSubId}. Because this plan has a Stripe price, the next Stripe event will overwrite what you set here — change the plan in Stripe instead.`,
    );
  }

  // See lib/billing/period.ts for why the start is inherited rather than reset.
  const { start, end } = resolvePeriod({
    inputStart: input.currentPeriodStart,
    inputEnd: input.currentPeriodEnd,
    existingStart: existing?.currentPeriodStart,
    billingCycle: input.billingCycle,
    now: new Date(),
  });

  const invalid = periodError(start, end, input.trialEndsAt);
  if (invalid) return NextResponse.json({ success: false, error: invalid }, { status: 400 });

  const data = {
    planId: plan.id,
    status: input.status,
    billingCycle: input.billingCycle,
    currentPeriodStart: start,
    currentPeriodEnd: end,
    trialEndsAt: resolveTrialEnd(input.status, input.trialEndsAt, end),
    cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
    cancelledAt: input.status === "CANCELLED" ? (existing?.cancelledAt ?? new Date()) : null,
    // Set on an offline plan, cleared on a Stripe-priced one — at which point
    // Stripe owns the row again and should be allowed to write to it.
    planLockedAt: offlineInvoiced ? new Date() : null,
    ...(input.resetUsage && { aiCreditsUsed: 0 }),
  };

  const subscription = await prisma.subscription.upsert({
    where: { tenantId: id },
    create: { tenantId: id, ...data },
    update: data,
    include: { plan: true },
  });

  // Reported after the write, not before it. Clamping a tenant below its current
  // usage is a legitimate thing for a super-admin to do deliberately — a deal
  // that shrank, an account being wound down — so this is information to act on,
  // not a veto. The panel shows the same list live before saving.
  const overages = planOverages(usedCounts(await getUsage(id)), plan);

  await recordBillingAudit({
    tenantId: id,
    userId: session.user.id,
    action: "SUBSCRIPTION_ASSIGNED",
    resource: "subscription",
    resourceId: subscription.id,
    metadata: {
      planId: plan.id,
      planName: plan.name,
      visibility: plan.visibility,
      status: data.status,
      billingCycle: data.billingCycle,
      currentPeriodEnd: end.toISOString(),
      previousPlanId: existing?.planId ?? null,
      planLocked: offlineInvoiced,
      resetUsage: input.resetUsage,
      overages: overages.map((o) => o.label + " " + o.used + "/" + o.limit),
      warnings,
    },
  });

  return NextResponse.json({ success: true, data: { subscription, overages, warnings } });
}
