// ============================================================================
// ROUTE  : POST /api/auth/forgot-password
//
// Starts the password-reset flow: mints a single-use, time-boxed token, stores
// only its hash, and emails the recovery link. Always responds with success,
// whether or not the email matches an account — revealing which addresses are
// registered would turn this endpoint into an account-enumeration oracle.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail, passwordResetEmail } from "@/lib/email";
import { forgotPasswordSchema } from "@/lib/validators/auth";

const TOKEN_TTL_MINUTES = 30;

/** The recovery link is a bearer secret, so only its SHA-256 hash is stored. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  // Uniform success response, regardless of outcome.
  const genericOk = NextResponse.json({ success: true });

  try {
    const { email } = parsed.data;
    const user = await prisma.user.findFirst({
      where: { email, isActive: true },
      select: { id: true, name: true, email: true },
    });

    // Silently stop for unknown/inactive accounts — no token, no email, same response.
    if (!user) return genericOk;

    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

    // Invalidate any earlier outstanding tokens so only the newest link works.
    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
      prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } }),
    ]);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    const resetUrl = `${appUrl.replace(/\/$/, "")}/reset-password?token=${token}`;
    const { subject, html } = passwordResetEmail({
      name: user.name,
      resetUrl,
      expiresMinutes: TOKEN_TTL_MINUTES,
    });
    const result = await sendEmail({ to: user.email, subject, html });

    if (!result.delivered && process.env.NODE_ENV !== "production") {
      console.info(`[FORGOT PASSWORD] Email not delivered. Reset link for ${email}: ${resetUrl}`);
    }

    return genericOk;
  } catch (error) {
    console.error("[FORGOT PASSWORD]", error);
    // Still return success to keep the response uniform; the user can retry.
    return genericOk;
  }
}
