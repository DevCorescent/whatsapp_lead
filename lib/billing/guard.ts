// ============================================================================
// MODULE : Route-level plan guards
// ============================================================================
//
// The assertion helpers throw, which is the right shape for a service but the
// wrong one for a route handler: every creation endpoint already sits inside a
// try/catch that answers 500, so an unguarded throw would surface a plan limit
// as "Failed to create business" and the client would never see the upgrade
// dialog. These turn the throw into the response to return, so each check reads
// as one guard clause at the top of the handler and cannot be swallowed further
// down.
//
// All three return `NextResponse | null` — return it when non-null, carry on
// when null.

import { NextResponse } from "next/server";
import {
  FeatureError,
  LimitError,
  featureErrorBody,
  limitErrorBody,
  type LimitResource,
  type PlanFeature,
} from "@/lib/billing/limits";
import { assertBelowCeiling, assertFeature, assertWithinLimit } from "@/lib/billing/usage";

/**
 * Convert a thrown plan refusal into its 403. Anything else propagates: a
 * dropped database connection must not be reported as "over limit" when we never
 * established that.
 */
function refusalResponse(error: unknown): NextResponse {
  if (error instanceof LimitError) {
    return NextResponse.json(limitErrorBody(error), { status: 403 });
  }
  if (error instanceof FeatureError) {
    return NextResponse.json(featureErrorBody(error), { status: 403 });
  }
  throw error;
}

/** Check whether the tenant may add `increment` more of a counted `resource`. */
export async function guardLimit(
  tenantId: string,
  resource: LimitResource,
  increment = 1,
): Promise<NextResponse | null> {
  try {
    await assertWithinLimit(tenantId, resource, increment);
    return null;
  } catch (error) {
    return refusalResponse(error);
  }
}

/** Check whether the tenant's plan includes `feature` at all. */
export async function guardFeature(
  tenantId: string,
  feature: PlanFeature,
): Promise<NextResponse | null> {
  try {
    await assertFeature(tenantId, feature);
    return null;
  } catch (error) {
    return refusalResponse(error);
  }
}

/**
 * Check a single request against a per-request ceiling — one campaign's audience,
 * one file's size. `limit` comes from the caller because it has already resolved
 * the plan; this avoids a second lookup on a path that just did one.
 */
export function guardCeiling(
  resource: LimitResource,
  value: number,
  limit: number,
  planName: string,
): NextResponse | null {
  try {
    assertBelowCeiling(resource, value, limit, planName);
    return null;
  } catch (error) {
    return refusalResponse(error);
  }
}
