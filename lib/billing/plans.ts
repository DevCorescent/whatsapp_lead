// ============================================================================
// MODULE : Plan visibility & purchasability
// ============================================================================
//
// Plans come in two kinds (Plan.visibility):
//
//   PUBLIC   — on the pricing page, buyable by anyone through checkout.
//   PRIVATE  — a custom tier a super-admin negotiated and assigned. Never
//              listed, never self-serve purchasable.
//
// The rule matters because a planId is not a secret: it travels in the pricing
// page's JSON and in every checkout request body. Without a visibility filter,
// a tenant that learned another customer's custom planId could POST it to
// /api/billing/checkout and subscribe itself to a negotiated ₹0 enterprise
// tier. So "which plans may this tenant reach" is written once, here, and every
// self-serve billing route asks this module rather than filtering inline.
//
// Admin routes deliberately do NOT use these helpers: a super-admin assigning a
// custom plan is exactly the case these filters exist to exclude.

import type { Plan, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Where-fragment for the plans `tenantId` may buy for itself.
 *
 * A private plan is reachable only by the tenant named in `ownerTenantId`. An
 * *unowned* private plan (owner null — the reusable agency tier) is reachable by
 * nobody: it is assignable by an admin but never self-serve, since there is no
 * tenant it can be said to belong to.
 */
export function purchasablePlanWhere(tenantId: string): Prisma.PlanWhereInput {
  return {
    isActive: true,
    OR: [{ visibility: "PUBLIC" }, { ownerTenantId: tenantId }],
  };
}

/**
 * Resolve a plan the tenant is allowed to buy, or null.
 *
 * Returns null for "no such plan" and for "not yours" alike — callers answer
 * both with a 404. Distinguishing them would confirm to a tenant that some other
 * customer's custom plan exists, which is the thing the filter is hiding.
 */
export async function findPurchasablePlan(tenantId: string, planId: string): Promise<Plan | null> {
  return prisma.plan.findFirst({ where: { id: planId, ...purchasablePlanWhere(tenantId) } });
}

/**
 * The plan cards to render for a tenant: everything it can buy, plus whatever it
 * is on right now.
 *
 * The current plan is unioned in deliberately. A tenant parked on a custom tier
 * — or on a public one since retired with `isActive: false` — matches neither
 * half of the purchasable filter, and without this the billing page would show a
 * grid of plans with nothing marked "current" and an apparent invitation to
 * "upgrade" to something smaller than what they already pay for.
 */
export async function listPlansFor(
  tenantId: string,
): Promise<{ plans: Plan[]; currentPlanId: string | null; status: string | null }> {
  const [purchasable, subscription] = await Promise.all([
    prisma.plan.findMany({ where: purchasablePlanWhere(tenantId), orderBy: { sortOrder: "asc" } }),
    prisma.subscription.findUnique({
      where: { tenantId },
      select: { planId: true, status: true, plan: true },
    }),
  ]);

  const current = subscription?.plan ?? null;
  const plans =
    current && !purchasable.some((p) => p.id === current.id)
      ? [...purchasable, current].sort((a, b) => a.sortOrder - b.sortOrder)
      : purchasable;

  return { plans, currentPlanId: subscription?.planId ?? null, status: subscription?.status ?? null };
}

/**
 * A unique `Plan.name` for a custom tier.
 *
 * `Plan.name` is the unique machine key (STARTER, GROWTH) and is not something a
 * super-admin should be asked to invent — they name the card, in `displayName`.
 * Derived from the tenant slug so the row is identifiable in the database, and
 * suffixed on collision because one tenant may be sold more than one custom tier
 * over its life (last year's deal is still attached to its old subscription).
 */
export async function generateCustomPlanName(tenantSlug: string | null): Promise<string> {
  const base = `CUSTOM_${(tenantSlug ?? "TENANT").toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`.slice(0, 48);

  const siblings = await prisma.plan.findMany({
    where: { name: { startsWith: base } },
    select: { name: true },
  });
  const taken = new Set(siblings.map((p) => p.name));
  if (!taken.has(base)) return base;

  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`Could not generate a unique plan name for ${base}`);
}
