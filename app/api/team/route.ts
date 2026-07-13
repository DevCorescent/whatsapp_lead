import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

const inviteSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  role: z.nativeEnum(UserRole).default("AGENT"),
  phone: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    const members = await prisma.user.findMany({
      where: { tenantId, role: { not: "SUPER_ADMIN" } },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        phone: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        _count: {
          select: {
            assignedConvs: { where: { status: { in: ["OPEN", "ASSIGNED"] } } },
            assignedTickets: { where: { status: { notIn: ["RESOLVED", "CLOSED"] } } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ success: true, data: members });
  } catch (error) {
    console.error("[TEAM GET]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch team" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, role: callerRole } = session.user;

  // Only TENANT_OWNER, ADMIN, MANAGER can invite
  if (!["SUPER_ADMIN", "TENANT_OWNER", "ADMIN", "MANAGER"].includes(callerRole)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const { name, email, role, phone } = parsed.data;

    // Check for duplicate email in tenant
    const existing = await prisma.user.findUnique({ where: { email_tenantId: { email, tenantId } } });
    if (existing) return NextResponse.json({ success: false, error: "User with this email already exists" }, { status: 409 });

    // Generate a temporary password
    const tempPassword = Math.random().toString(36).slice(-10) + "A1!";
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const user = await prisma.user.create({
      data: {
        tenantId,
        name,
        email,
        password: hashedPassword,
        role,
        ...(phone && { phone }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, data: { ...user, tempPassword } }, { status: 201 });
  } catch (error) {
    console.error("[TEAM POST]", error);
    return NextResponse.json({ success: false, error: "Failed to invite team member" }, { status: 500 });
  }
}
