// ============================================================================
// ROUTE  : /api/team/[id]/permissions
//
// GET  — Returns the member's role defaults, per-user overrides, and effective
//        permission set. Owner / Admin only.
// PUT  — Upsert or clear per-user permission overrides.
//        Body: { overrides: { [permission]: true | false | null } }
//        null removes the override and reverts to the role default.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  PERMISSIONS,
  accountCeiling,
  invalidatePermissionCache,
  resolvePermission,
  roleDefaults,
  type Permission,
} from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

function canManagePermissions(callerRole: string) {
  return ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"].includes(callerRole);
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!canManagePermissions(session.user.role))
    return NextResponse.json({ success: false, error: "Only owners and admins can view member permissions" }, { status: 403 });

  const { id } = await params;
  const member = await prisma.user.findFirst({
    where: { id, tenantId: session.user.tenantId, role: { not: "SUPER_ADMIN" } },
    select: { id: true, role: true, userPermissions: { select: { permission: true, allowed: true } } },
  });
  if (!member) return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });

  const overrideMap = new Map(member.userPermissions.map((p) => [p.permission, p.allowed]));
  const ceiling = accountCeiling(session.user.accountType, session.user.resellerType);

  const result: Record<string, { roleDefault: boolean; override: boolean | null; effective: boolean }> = {};
  for (const p of PERMISSIONS) {
    const inCeiling = ceiling.includes(p);
    const roleDefault = inCeiling && roleDefaults(member.role).includes(p);
    const override = overrideMap.has(p) ? overrideMap.get(p)! : null;
    const effective = inCeiling ? (override !== null ? override : roleDefault) : false;
    result[p] = { roleDefault, override, effective };
  }

  return NextResponse.json({ success: true, data: result });
}

const putSchema = z.object({
  overrides: z.record(z.string(), z.boolean().nullable()),
});

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!canManagePermissions(session.user.role))
    return NextResponse.json({ success: false, error: "Only owners and admins can edit member permissions" }, { status: 403 });

  const { id } = await params;
  const member = await prisma.user.findFirst({
    where: { id, tenantId: session.user.tenantId, role: { not: "SUPER_ADMIN" } },
    select: { id: true, role: true },
  });
  if (!member) return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

  const ceiling = accountCeiling(session.user.accountType, session.user.resellerType);
  const validPermissions = new Set<string>(PERMISSIONS);

  // Owners cannot have their permissions customized (they hold everything in their account)
  if (member.role === "TENANT_OWNER")
    return NextResponse.json({ success: false, error: "Owner permissions cannot be customized" }, { status: 400 });

  try {
    await prisma.$transaction(async (tx) => {
      for (const [rawPerm, value] of Object.entries(parsed.data.overrides)) {
        if (!validPermissions.has(rawPerm)) continue;
        const perm = rawPerm as Permission;

        if (value === null) {
          // null = remove override
          await tx.userPermission.deleteMany({ where: { userId: member.id, permission: perm } });
        } else {
          // true / false = set override, but only within the account ceiling
          if (!ceiling.includes(perm)) continue;
          await tx.userPermission.upsert({
            where: { userId_permission: { userId: member.id, permission: perm } },
            create: { userId: member.id, permission: perm, allowed: value as boolean },
            update: { allowed: value as boolean },
          });
        }
      }
    });

    invalidatePermissionCache(member.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[TEAM PERMISSIONS PUT]", err);
    return NextResponse.json({ success: false, error: "Failed to update permissions" }, { status: 500 });
  }
}
