// ============================================================================
// MODULE : Account provisioning
//
// Creating an account (tenant + owner login + settings + subscription) in one
// place, for the super admin (any account type) and for resellers (their own
// clients). Self-service sign-up stays in /api/auth/register.
//
// Fixes carried over from the old admin route: the owner is a TENANT_OWNER (it
// was created as ADMIN, so no one in a new account could manage billing or
// transfer ownership), and the temporary password comes from the CSPRNG (it was
// Math.random, which is predictable).
// ============================================================================

import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import type { AccountType, ResellerType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateTempPassword } from "@/lib/roles";

export class ProvisioningError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "ProvisioningError";
  }
}

export interface ProvisionInput {
  name: string;
  /** Exact slug to use (admin); taken → error. Otherwise derived from the name. */
  slug?: string | null;
  ownerName?: string | null;
  ownerEmail: string;
  accountType: Exclude<AccountType, "PLATFORM">;
  resellerType?: ResellerType | null;
  /** Client under a reseller: sets parent and referral to that reseller. */
  resellerId?: string | null;
  commissionRate?: number | null;
  categoryId?: string | null;
  /** Plan to subscribe to; none for accounts that don't need one (resellers). */
  planId?: string | null;
  trialDays?: number;
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "account";
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}-${randomBytes(2).toString("hex")}`;
    if (!(await prisma.tenant.findUnique({ where: { slug: candidate }, select: { id: true } }))) return candidate;
  }
  throw new ProvisioningError("Could not generate a unique account slug", 500);
}

async function uniqueInviteCode(): Promise<string> {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (let i = 0; i < 20; i++) {
    const code = Array.from(randomBytes(8), (b) => chars[b % chars.length]).join("");
    if (!(await prisma.user.findUnique({ where: { inviteCode: code }, select: { id: true } }))) return code;
  }
  throw new ProvisioningError("Could not generate an invite code", 500);
}

/** Owner name from an email when none was given: "rahul.sharma@x" → "Rahul Sharma". */
function nameFromEmail(email: string): string {
  return email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function provisionAccount(input: ProvisionInput) {
  const email = input.ownerEmail.trim().toLowerCase();
  // Sign-in looks users up by email across all accounts, so an email may exist only once.
  if (await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } })) {
    throw new ProvisioningError("A user with that email already exists", 409);
  }

  if (input.accountType === "RESELLER") {
    if (!input.resellerType) throw new ProvisioningError("Choose the reseller type");
    if (input.resellerId) throw new ProvisioningError("A reseller can't sit under another reseller");
  }
  if (input.resellerId) {
    const parent = await prisma.tenant.findFirst({
      where: { id: input.resellerId, accountType: "RESELLER", isActive: true },
      select: { id: true },
    });
    if (!parent) throw new ProvisioningError("Reseller not found or inactive");
  }

  let slug: string;
  if (input.slug) {
    slug = slugify(input.slug);
    if (await prisma.tenant.findUnique({ where: { slug }, select: { id: true } })) {
      throw new ProvisioningError("Slug already taken", 409);
    }
  } else {
    slug = await uniqueSlug(input.name);
  }
  const inviteCode = await uniqueInviteCode();
  const tempPassword = generateTempPassword();
  const password = await bcrypt.hash(tempPassword, 12);

  const days = Math.max(0, Math.min(90, input.trialDays ?? 0));
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const trialEnd = days > 0 ? new Date(now.getTime() + days * 24 * 60 * 60 * 1000) : null;

  const { tenant, user } = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: input.name.trim(),
        slug,
        accountType: input.accountType,
        resellerType: input.accountType === "RESELLER" ? input.resellerType : null,
        commissionRate: input.accountType === "RESELLER" ? input.commissionRate ?? 0 : null,
        parentId: input.resellerId ?? null,
        referredById: input.resellerId ?? null,
        categoryId: input.categoryId ?? null,
        settings: { create: {} },
      },
    });

    if (input.planId) {
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: input.planId,
          status: trialEnd ? "TRIALING" : "ACTIVE",
          billingCycle: "MONTHLY",
          currentPeriodStart: now,
          currentPeriodEnd: trialEnd ?? periodEnd,
          ...(trialEnd && { trialEndsAt: trialEnd }),
        },
      });
    }

    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        name: input.ownerName?.trim() || nameFromEmail(email),
        email,
        password,
        role: "TENANT_OWNER",
        inviteCode,
      },
    });

    return { tenant, user };
  });

  return { tenant, user, tempPassword };
}
