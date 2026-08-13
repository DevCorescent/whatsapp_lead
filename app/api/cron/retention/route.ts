// ============================================================================
// ROUTE : /api/cron/retention  (GET)
//
// Message history retention. Each tick deletes messages older than the tenant's
// plan allows (Plan.retentionDays), one tenant at a time.
//
// AUTH: machine-only. Requires `Authorization: Bearer ${CRON_SECRET}` — the same
// scheme as /api/cron/campaigns and /api/cron/templates.
// ============================================================================
//
// This is the only scheduled job in the system that destroys customer data, so
// it is deliberately the most conservative one:
//
//   · A tenant is skipped entirely unless its plan sets retentionDays above 0.
//     0 is the column default, so a database that has not been re-seeded since
//     the column was added deletes nothing at all — the failure mode of a
//     misconfiguration is "kept too long", never "deleted too early".
//   · Notes are excluded. An agent's internal note is the workspace's own record
//     of the account, not the customer's conversation, and people do not expect
//     their own annotations to expire.
//   · Conversations, contacts and leads are untouched. Retention trims history;
//     it does not delete the relationship, and a thread that empties still shows
//     who the customer is and which stage they reached.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/** Oldest timestamp a tenant on this plan is allowed to keep. */
function cutoffFor(retentionDays: number): Date {
  return new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Only subscriptions whose plan actually sets a retention window. Tenants on
    // the implicit free tier have no Subscription row and are therefore never
    // swept — deleting the data of someone who has not agreed to a plan at all
    // is not a decision this job should be making.
    const subscriptions = await prisma.subscription.findMany({
      where: { plan: { retentionDays: { gt: 0 } } },
      select: { tenantId: true, plan: { select: { retentionDays: true, displayName: true } } },
    });

    let deleted = 0;
    const swept: Array<{ tenantId: string; deleted: number; retentionDays: number }> = [];

    for (const { tenantId, plan } of subscriptions) {
      // Contained per tenant: one workspace whose delete fails must not stop the
      // rest of the sweep, or a single bad row would freeze retention platform-wide.
      try {
        const result = await prisma.message.deleteMany({
          where: {
            tenantId,
            isNote: false,
            createdAt: { lt: cutoffFor(plan.retentionDays) },
          },
        });

        if (result.count > 0) {
          deleted += result.count;
          swept.push({ tenantId, deleted: result.count, retentionDays: plan.retentionDays });
          console.log("[CRON RETENTION] Trimmed message history", {
            tenantId,
            plan: plan.displayName,
            retentionDays: plan.retentionDays,
            deleted: result.count,
          });
        }
      } catch (error) {
        console.error(`[CRON RETENTION] Failed to sweep tenant ${tenantId}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      tenantsChecked: subscriptions.length,
      tenantsSwept: swept.length,
      messagesDeleted: deleted,
      swept,
    });
  } catch (error) {
    console.error("[CRON RETENTION]", error);
    return NextResponse.json({ success: false, error: "Retention sweep failed" }, { status: 500 });
  }
}
