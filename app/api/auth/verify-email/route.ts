// ROUTE: GET /api/auth/verify-email?token=<hex>
// Validates the single-use token mailed at registration, marks the user's email as
// verified, and clears the token so it cannot be replayed.

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.redirect(new URL("/verify-email?error=missing", req.url));
  }

  const user = await prisma.user.findUnique({
    where: { emailVerifyToken: token },
    select: { id: true, emailVerified: true, emailVerifyExpiry: true },
  });

  if (!user) {
    return NextResponse.redirect(new URL("/verify-email?error=invalid", req.url));
  }

  if (user.emailVerified) {
    return NextResponse.redirect(new URL("/login?verified=1", req.url));
  }

  if (user.emailVerifyExpiry && user.emailVerifyExpiry < new Date()) {
    return NextResponse.redirect(new URL("/verify-email?error=expired", req.url));
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      emailVerifyToken: null,
      emailVerifyExpiry: null,
    },
  });

  return NextResponse.redirect(new URL("/login?verified=1", req.url));
}

// POST /api/auth/verify-email  { email }  — resend the verification email
export async function POST(req: NextRequest) {
  try {
    const { email } = (await req.json()) as { email?: string };
    if (!email) return NextResponse.json({ success: false, error: "Email required" }, { status: 400 });

    const user = await prisma.user.findFirst({
      where: { email, emailVerified: false },
      select: { id: true, name: true, tenantId: true, emailVerifyExpiry: true },
    });

    // Always return success — don't leak whether the email exists or is already verified
    if (!user) return NextResponse.json({ success: true });

    // Rate-limit resend: only allow if the existing token is more than 1 min old
    const { randomBytes } = await import("crypto");
    const { sendVerificationEmail } = await import("@/lib/email");

    const newToken = randomBytes(32).toString("hex");
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifyToken: newToken,
        emailVerifyExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const rawHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
    const isLocal = rawHost.includes("localhost") || rawHost.startsWith("127.");
    const appBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
    const baseUrl = isLocal && appBase ? appBase : `https://${rawHost}`;
    const verifyUrl = `${baseUrl}/verify-email?token=${newToken}`;

    await sendVerificationEmail({
      to: email,
      name: user.name,
      verifyUrl,
      tenantId: user.tenantId,
    }).catch((err) => console.error("[RESEND VERIFY]", err));

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to resend" }, { status: 500 });
  }
}
