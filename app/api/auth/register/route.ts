import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { registerSchema } from "@/lib/validators/auth";
import { resellerForHost } from "@/lib/branding";

/**
 * The reseller a sign-up belongs to, if any.
 *
 *   1. Signing up on a white-label reseller's domain puts the account under that
 *      reseller — its customers must see its brand and plans.
 *   2. Otherwise, a referral code belonging to a user of an active reseller account
 *      credits that reseller (commission) and places the client under it.
 *
 * Any other code (a regular user's) is kept only as `referredByCode`, as before.
 */
async function resolveReseller(host: string | null, code: string | null): Promise<string | null> {
  const byDomain = await resellerForHost(host);
  if (byDomain) return byDomain;
  if (!code) return null;
  const referrer = await prisma.user.findUnique({
    where: { inviteCode: code },
    select: { isActive: true, tenant: { select: { id: true, accountType: true, isActive: true } } },
  });
  if (referrer?.isActive && referrer.tenant.isActive && referrer.tenant.accountType === "RESELLER") {
    return referrer.tenant.id;
  }
  return null;
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generateInviteCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { name, email, password, workspaceName } = parsed.data;

    // Optional invite code from the signup form — stored for referral tracking only.
    const inviteCode =
      typeof (body as Record<string, unknown>).inviteCode === "string"
        ? ((body as Record<string, unknown>).inviteCode as string).trim().toUpperCase() || null
        : null;

    // If a code was supplied, verify it exists — reject unknown codes immediately
    // so users don't silently register without the credit they expected.
    if (inviteCode) {
      const codeOwner = await prisma.user.findUnique({
        where: { inviteCode },
        select: { id: true },
      });
      if (!codeOwner) {
        return NextResponse.json(
          { success: false, error: "Invalid invite code — please check it and try again." },
          { status: 400 }
        );
      }
    }

    // Block disposable / throwaway email domains
    const emailDomain = email.split("@")[1]?.toLowerCase();
    const DISPOSABLE_DOMAINS = new Set([
      "mailinator.com","guerrillamail.com","guerrillamail.info","guerrillamail.biz",
      "guerrillamail.de","guerrillamail.net","guerrillamail.org","guerrillamailblock.com",
      "tempmail.com","temp-mail.org","throwam.com","throwaway.email","throwam.com",
      "fakeinbox.com","sharklasers.com","guerrillamailblock.com","grr.la","guerrillamail.info",
      "spam4.me","yopmail.com","yopmail.fr","cool.fr.nf","jetable.fr.nf","nospam.ze.tc",
      "nomail.xl.cx","mega.zik.dj","speed.1s.fr","courriel.fr.nf","moncourrier.fr.nf",
      "monemail.fr.nf","monmail.fr.nf","dispostable.com","mailnull.com","spamgourmet.com",
      "trashmail.at","trashmail.io","trashmail.me","trashmail.net","trashmail.org",
      "trashmail.xyz","trashmailer.com","trash-mail.at","discard.email","discardmail.com",
      "discardmail.de","spamspot.com","spamthisplease.com","spamhereplease.com",
      "mailexpire.com","mailforspam.com","maileater.com","mail-temporaire.fr",
      "jetable.com","jetable.net","jetable.org","jetable.pro","nwldx.com",
      "wegwerfmail.de","wegwerfmail.net","wegwerfmail.org","10minutemail.com",
      "10minutemail.net","10minutemail.org","10minute-mail.com","20minutemail.com",
      "mohmal.com","getnada.com","mailnesia.com","maildrop.cc","mailnull.com",
      "spamgourmet.net","spamgourmet.org","tempr.email","discard.email",
      "mailboxy.fun","inboxkitten.com","tempinbox.com","spamex.com","binkmail.com",
      "safetymail.info","tempalias.com","mytrashmail.com","mintemail.com",
    ]);
    if (emailDomain && DISPOSABLE_DOMAINS.has(emailDomain)) {
      return NextResponse.json(
        { success: false, error: "Please use a real work or personal email address — disposable email services are not allowed." },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingUser = await prisma.user.findFirst({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: "Email already registered" },
        { status: 409 }
      );
    }

    // Generate unique tenant slug
    let slug = slugify(workspaceName);
    const existingSlug = await prisma.tenant.findUnique({ where: { slug } });
    if (existingSlug) slug = `${slug}-${Date.now()}`;

    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate a unique invite code for the new user.
    // Retry on the rare collision (8 uppercase alphanumeric chars = 36^8 ≈ 2.8 trillion combos).
    let newInviteCode = generateInviteCode();
    while (await prisma.user.findUnique({ where: { inviteCode: newInviteCode } })) {
      newInviteCode = generateInviteCode();
    }

    const resellerId = await resolveReseller(req.headers.get("x-forwarded-host") ?? req.headers.get("host"), inviteCode);

    // Create tenant + owner user + default settings + starter plan subscription
    const starterPlan = await prisma.plan.findFirst({ where: { name: "STARTER" } });

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: workspaceName,
          slug,
          referredByCode: inviteCode,
          accountType: "CLIENT",
          ...(resellerId && { parentId: resellerId, referredById: resellerId }),
          settings: { create: {} },
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name,
          email,
          password: hashedPassword,
          role: "TENANT_OWNER",
          inviteCode: newInviteCode,
          emailVerified: true,
        },
      });

      if (starterPlan) {
        await tx.subscription.create({
          data: {
            tenantId: tenant.id,
            planId: starterPlan.id,
            status: "TRIALING",
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          },
        });
      }

      return { tenant, user };
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          userId: result.user.id,
          tenantId: result.tenant.id,
          tenantSlug: result.tenant.slug,
        },
        message: "Account created successfully.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[REGISTER]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
