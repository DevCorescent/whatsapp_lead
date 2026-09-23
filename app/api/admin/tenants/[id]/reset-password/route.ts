import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { id: tenantId } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { userId } = body as { userId?: string };
  if (!userId) return NextResponse.json({ success: false, error: "userId is required" }, { status: 400 });

  const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!user) return NextResponse.json({ success: false, error: "User not found in this tenant" }, { status: 404 });

  const tempPassword = Math.random().toString(36).slice(-8) + "A1!";
  const hashed = await bcrypt.hash(tempPassword, 10);

  await prisma.user.update({ where: { id: userId }, data: { password: hashed } });

  console.log("[admin/reset-password] reset password for user:", userId, "in tenant:", tenantId);

  return NextResponse.json({ success: true, data: { tempPassword, email: user.email } });
}
