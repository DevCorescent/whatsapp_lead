// ============================================================================
// ROUTE : /api/admin/permissions   (SUPER_ADMIN only)
//
// GET - The role → permission matrix for each account type: the fixed ceiling,
//       the code defaults, the stored overrides and the effective result.
// PUT - Set one override { accountType, role, permission, allowed }, or reset it
//       to the default with allowed: null. An override beyond the account type's
//       ceiling is refused — e.g. no setting can let a reseller read chats or send
//       messages (lib/permissions.ts).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  accountCeiling,
  invalidatePermissionCache,
  PERMISSIONS,
  resolvePermission,
  roleDefaults,
} from "@/lib/permissions";

const ACCOUNT_TYPES = ["CLIENT", "RESELLER"] as const;
const ROLES = ["TENANT_OWNER", "ADMIN", "MANAGER", "MARKETING_USER", "AGENT"] as const;

const putSchema = z.object({
  accountType: z.enum(ACCOUNT_TYPES),
  role: z.enum(ROLES),
  permission: z.enum(PERMISSIONS),
  allowed: z.boolean().nullable(),
});

async function superAdmin() {
  const session = await auth();
  if (!session?.user) return { error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  if (session.user.role !== "SUPER_ADMIN") return { error: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }) };
  return { session };
}

export async function GET() {
  const { error } = await superAdmin();
  if (error) return error;

  const rows = await prisma.rolePermission.findMany();
  const overrides = new Map(rows.map((r) => [`${r.accountType}:${r.role}:${r.permission}`, r.allowed]));

  // White-label resellers have the widest reseller ceiling, so the matrix shows theirs.
  const matrix = ACCOUNT_TYPES.map((accountType) => {
    const resellerType = accountType === "RESELLER" ? "WHITE_LABEL" : null;
    const ceiling = accountCeiling(accountType, resellerType);
    return {
      accountType,
      roles: ROLES.map((role) => ({
        role,
        permissions: PERMISSIONS.map((permission) => ({
          permission,
          available: ceiling.includes(permission),
          byDefault: roleDefaults(role).includes(permission),
          override: overrides.get(`${accountType}:${role}:${permission}`) ?? null,
          effective: resolvePermission({ role, accountType, resellerType }, permission, overrides),
        })),
      })),
    };
  });

  return NextResponse.json({ success: true, data: { permissions: PERMISSIONS, matrix } });
}

export async function PUT(req: NextRequest) {
  const { session, error } = await superAdmin();
  if (error) return error;

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  const { accountType, role, permission, allowed } = parsed.data;

  if (allowed && !accountCeiling(accountType, "WHITE_LABEL").includes(permission)) {
    return NextResponse.json(
      { success: false, error: `${permission} can never be granted to ${accountType.toLowerCase()} accounts` },
      { status: 400 },
    );
  }

  const key = { accountType_role_permission: { accountType, role, permission } };
  if (allowed === null) {
    await prisma.rolePermission.deleteMany({ where: { accountType, role, permission } });
  } else {
    await prisma.rolePermission.upsert({
      where: key,
      create: { accountType, role, permission, allowed },
      update: { allowed },
    });
  }
  invalidatePermissionCache();

  await prisma.auditLog.create({
    data: {
      tenantId: (session!.user.viewAs?.homeTenantId ?? session!.user.tenantId),
      userId: session!.user.id,
      action: "PERMISSION_CHANGED",
      resource: "role_permission",
      resourceId: `${accountType}:${role}:${permission}`,
      metadata: { allowed },
    },
  });
  return NextResponse.json({ success: true });
}
