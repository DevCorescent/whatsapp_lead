import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function generateInviteCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, inviteCode: true },
  });
  if (!user) {
    return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
  }

  // Lazy-generate invite code on first access for existing users created before this feature.
  if (!user.inviteCode) {
    let code = generateInviteCode();
    while (await prisma.user.findUnique({ where: { inviteCode: code } })) {
      code = generateInviteCode();
    }
    await prisma.user.update({ where: { id: userId }, data: { inviteCode: code } });
    return NextResponse.json({ success: true, data: { inviteCode: code } });
  }

  return NextResponse.json({ success: true, data: { inviteCode: user.inviteCode } });
}
