// ============================================================================
// MODULE : Account hierarchy
//
//   Super Admin (PLATFORM account)
//   ├── Reseller (NORMAL)        └── Client …
//   ├── Reseller (WHITE_LABEL)   └── Client …   (clients see the reseller's brand)
//   └── Client (direct)
//
// A Tenant row is an account. `accountType` says which kind, `resellerType` which
// kind of reseller, `parentId` which reseller manages a client, `referredById`
// which reseller earns commission on it. Users are logins inside one account;
// their `role` is their staff role there.
//
// Privacy rule: a reseller sees its clients' account and usage data only. Client
// data (contacts, chats, messages, campaigns) stays tenant-scoped to the client —
// no reseller route reads it, and reseller accounts are refused by every
// business-scoped route (getBusinessScope) and by proxy.ts.
// ============================================================================

import type { AccountType, Prisma, ResellerType } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Principal } from "@/lib/permissions";

export interface AccountScope extends Principal {
  userId: string;
  role: string;
  tenantId: string;
  tenantName: string;
  accountType: AccountType;
  resellerType: ResellerType | null;
  parentId: string | null;
}

/**
 * The signed-in user with their account's CURRENT type, read from the database.
 * For routes whose decision depends on the account type (reseller and admin
 * routes), so a just-converted account can't act on a stale session.
 */
export async function getAccountScope(): Promise<AccountScope | null> {
  const session = await auth();
  if (!session?.user) return null;
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { name: true, isActive: true, accountType: true, resellerType: true, parentId: true },
  });
  if (!tenant || !tenant.isActive) return null;
  return {
    userId: session.user.id,
    role: session.user.role,
    tenantId: session.user.tenantId,
    tenantName: tenant.name,
    accountType: tenant.accountType,
    resellerType: tenant.resellerType,
    parentId: tenant.parentId,
  };
}

/** 401 / 403 for routes only a reseller account may call; null when allowed. */
export function requireReseller(scope: AccountScope | null): NextResponse | null {
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (scope.accountType !== "RESELLER") {
    return NextResponse.json({ success: false, error: "Only reseller accounts can do this" }, { status: 403 });
  }
  return null;
}

/** The clients a reseller manages or referred. */
export function resellerClientsWhere(resellerId: string): Prisma.TenantWhereInput {
  return { accountType: "CLIENT", OR: [{ parentId: resellerId }, { referredById: resellerId }] };
}

/**
 * A client of this reseller that the reseller may *manage* (suspend, change plan):
 * only the ones it is the parent of. A client that was merely referred, then moved
 * under someone else, stays visible for commission but is no longer managed.
 */
export async function findManagedClient(resellerId: string, clientId: string) {
  return prisma.tenant.findFirst({
    where: { id: clientId, accountType: "CLIENT", parentId: resellerId },
  });
}

/** Validate a proposed parent for a client account: it must be an active reseller. */
export async function validResellerParent(parentId: string): Promise<boolean> {
  const parent = await prisma.tenant.findFirst({
    where: { id: parentId, accountType: "RESELLER", isActive: true },
    select: { id: true },
  });
  return Boolean(parent);
}
