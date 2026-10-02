// ROUTE: GET/PUT /api/reseller/smtp
// Resellers can configure their own outbound SMTP server so that all emails
// sent to their clients (invites, password resets, low-balance alerts) come
// from the reseller's own mail server and domain rather than the platform's.
//
// Hierarchy: reseller SMTP → platform SMTP (env) → error.
// Client accounts automatically inherit their parent reseller's SMTP.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAccountScope, requireReseller } from "@/lib/accounts";
import { requirePermission } from "@/lib/permissions";
import nodemailer from "nodemailer";

const smtpSchema = z.object({
  smtpHost: z.string().trim().max(253).optional().nullable(),
  smtpPort: z.number().int().min(1).max(65535).optional().nullable(),
  smtpUser: z.string().trim().max(200).optional().nullable(),
  smtpPass: z.string().max(500).optional().nullable(),
  smtpFrom: z.string().trim().max(300).optional().nullable(),
});

export async function GET() {
  const scope = await getAccountScope();
  const notReseller = requireReseller(scope);
  if (notReseller) return notReseller;
  const denied = await requirePermission(scope, "whitelabel.manage");
  if (denied) return denied;

  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: scope!.tenantId },
    select: { smtpHost: true, smtpPort: true, smtpUser: true, smtpFrom: true },
    // smtpPass deliberately excluded from GET — never send credentials back to the browser
  });

  return NextResponse.json({ success: true, data: settings ?? {} });
}

export async function PUT(req: NextRequest) {
  const scope = await getAccountScope();
  const notReseller = requireReseller(scope);
  if (notReseller) return notReseller;
  const denied = await requirePermission(scope, "whitelabel.manage");
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = smtpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom } = parsed.data;

  // If all SMTP fields are present, do a quick connection test before saving
  if (smtpHost && smtpUser && smtpPass && smtpFrom) {
    try {
      const transport = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort ?? 465,
        secure: (smtpPort ?? 465) === 465,
        auth: { user: smtpUser, pass: smtpPass },
        connectionTimeout: 8000,
      });
      await transport.verify();
    } catch (err) {
      return NextResponse.json(
        { success: false, error: `SMTP connection test failed: ${err instanceof Error ? err.message : "unknown error"}` },
        { status: 400 }
      );
    }
  }

  await prisma.tenantSettings.upsert({
    where: { tenantId: scope!.tenantId },
    create: {
      tenantId: scope!.tenantId,
      smtpHost: smtpHost ?? null,
      smtpPort: smtpPort ?? null,
      smtpUser: smtpUser ?? null,
      smtpPass: smtpPass ?? null,
      smtpFrom: smtpFrom ?? null,
    },
    update: {
      smtpHost: smtpHost ?? null,
      smtpPort: smtpPort ?? null,
      smtpUser: smtpUser ?? null,
      ...(smtpPass !== undefined && { smtpPass: smtpPass ?? null }),
      smtpFrom: smtpFrom ?? null,
    },
  });

  return NextResponse.json({ success: true });
}

// DELETE — clears all SMTP config (revert to platform SMTP)
export async function DELETE() {
  const scope = await getAccountScope();
  const notReseller = requireReseller(scope);
  if (notReseller) return notReseller;
  const denied = await requirePermission(scope, "whitelabel.manage");
  if (denied) return denied;

  await prisma.tenantSettings.update({
    where: { tenantId: scope!.tenantId },
    data: { smtpHost: null, smtpPort: null, smtpUser: null, smtpPass: null, smtpFrom: null },
  });

  return NextResponse.json({ success: true });
}
