import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { sendEmail, teamInviteEmail } from "@/lib/email";
import { assertWithinLimit, LimitError } from "@/lib/billing/usage";

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

    // Billing: enforce the plan's team-member limit.
    try {
      await assertWithinLimit(tenantId, "users");
    } catch (e) {
      if (e instanceof LimitError) return NextResponse.json({ success: false, error: e.message }, { status: 403 });
      throw e;
    }

    const { name, email, role, phone } = parsed.data;

    // Check for duplicate email in tenant
    const existing = await prisma.user.findUnique({ where: { email_tenantId: { email, tenantId } } });
    if (existing) return NextResponse.json({ success: false, error: "User with this email already exists" }, { status: 409 });

    // Generate a cryptographically-strong temporary password. It is emailed to the
    // invitee and never returned to the browser, so nothing in the UI can leak it.
    const { randomBytes } = await import("node:crypto");
    const tempPassword = randomBytes(9).toString("base64url") + "A1!";
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

    // Deliver the invitation with login instructions and the temporary password.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    const { subject, html } = teamInviteEmail({
      inviteeName: name,
      email,
      workspaceName: session.user.tenantName ?? "your workspace",
      inviterName: session.user.name ?? undefined,
      tempPassword,
      loginUrl: `${appUrl.replace(/\/$/, "")}/login`,
    });
    const emailResult = await sendEmail({ to: email, subject, html });

    // In development without an email provider, surface the password in the server
    // log so the invite is still usable end to end. Never in production, never to the client.
    if (!emailResult.delivered && process.env.NODE_ENV !== "production") {
      console.info(`[TEAM INVITE] Email not delivered. Temp password for ${email}: ${tempPassword}`);
    }

    return NextResponse.json(
      { success: true, data: user, emailed: emailResult.delivered },
      { status: 201 },
    );
  } catch (error) {
    console.error("[TEAM POST]", error);
    return NextResponse.json({ success: false, error: "Failed to invite team member" }, { status: 500 });
  }
}
