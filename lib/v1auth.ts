/**
 * Incoming API authentication for /api/v1/* routes.
 *
 * Callers authenticate with:
 *   Authorization: Bearer wcrm_<key>
 *
 * The key maps to a TenantSettings.apiKey. Returns the tenant's scope
 * (tenantId + first active business) or null if the key is invalid/missing.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export interface V1Scope {
  tenantId: string;
  businessId: string;
}

export async function authenticateV1(req: NextRequest): Promise<V1Scope | null> {
  const auth = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;

  const settings = await prisma.tenantSettings.findUnique({
    where: { apiKey: token },
    select: { tenantId: true },
  });
  if (!settings) return null;

  const business = await prisma.business.findFirst({
    where: { tenantId: settings.tenantId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!business) return null;

  return { tenantId: settings.tenantId, businessId: business.id };
}

export function unauthorized() {
  return Response.json(
    { success: false, error: "Invalid or missing API key. Pass Authorization: Bearer <key>." },
    { status: 401 },
  );
}
