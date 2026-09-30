// ============================================================================
// ROUTE : /api/reseller/branding
//
// GET - The white-label reseller's brand settings.
// PUT - Save them: name, logo, favicon, colours, custom domain, contact details,
//       login page text. Shown to the reseller, its clients, and anyone visiting
//       its domain (lib/branding.ts).
//
// WHITE_LABEL reseller accounts only; whitelabel.manage (owner/admin). Links must
// be https, colours hex, and the domain a real hostname nobody else has claimed.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAccountScope, requireReseller } from "@/lib/accounts";
import { invalidateBrandCache } from "@/lib/branding";
import { isClaimableDomain, isClaimableSubdomain, normalizeHost, platformRootDomain } from "@/lib/hosts";
import { whiteLabelFeeStatus } from "@/lib/whiteLabelFee";
import { requirePermission } from "@/lib/permissions";
import { attachDomain, type DomainResult } from "@/lib/vercelDomains";

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .url("Must be a full URL")
  .refine((v) => v.startsWith("https://"), "Must start with https://");
const hex = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #0f766e");
const optional = <T extends z.ZodTypeAny>(s: T) => z.union([s, z.literal("")]).optional().nullable();

const brandingSchema = z.object({
  brandName: z.string().trim().min(1, "Brand name is required").max(60),
  logoUrl: optional(httpsUrl),
  faviconUrl: optional(httpsUrl),
  primaryColor: hex,
  accentColor: optional(hex),
  domain: optional(z.string().trim().max(253)),
  supportEmail: optional(z.string().trim().email("Enter a valid email")),
  supportPhone: optional(z.string().trim().max(30)),
  website: optional(httpsUrl),
  address: optional(z.string().trim().max(300)),
  loginHeadline: optional(z.string().trim().max(120)),
  loginSubtext: optional(z.string().trim().max(300)),
  subdomain: optional(z.string().trim().toLowerCase().max(30)),
  landingEnabled: z.boolean().optional(),
  landingTitle: optional(z.string().trim().max(120)),
  landingSubtitle: optional(z.string().trim().max(400)),
  termsContent: optional(z.string().max(30_000)),
  privacyContent: optional(z.string().max(30_000)),
  isActive: z.boolean().optional(),
});

const blank = (v: string | null | undefined) => (v ? v : null);

export async function GET() {
  const scope = await getAccountScope();
  const notReseller = requireReseller(scope);
  if (notReseller) return notReseller;
  const denied = await requirePermission(scope, "whitelabel.manage");
  if (denied) return denied;

  const config = await prisma.whiteLabelConfig.findUnique({ where: { tenantId: scope!.tenantId } });
  // Internal fee bookkeeping stays server-side; the reseller sees the status below.
  const { feeOverrideMinor: _o, feeDueSince: _d, ...visible } = config ?? ({} as Record<string, unknown>);
  void _o; void _d;
  return NextResponse.json({
    success: true,
    data: config ? visible : null,
    rootDomain: platformRootDomain(),
    fee: config ? await whiteLabelFeeStatus(scope!.tenantId) : null,
  });
}

export async function PUT(req: NextRequest) {
  const scope = await getAccountScope();
  const notReseller = requireReseller(scope);
  if (notReseller) return notReseller;
  // whitelabel.manage only exists within a WHITE_LABEL reseller's ceiling (lib/permissions.ts).
  const denied = await requirePermission(scope, "whitelabel.manage");
  if (denied) return denied;

  const parsed = brandingSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  const input = parsed.data;

  const domain = input.domain ? normalizeHost(input.domain) : null;
  if (domain && !isClaimableDomain(domain)) {
    return NextResponse.json({ success: false, error: "Enter a valid domain you own, e.g. crm.yourbrand.com" }, { status: 400 });
  }
  if (domain) {
    const taken = await prisma.whiteLabelConfig.findFirst({
      where: { domain, tenantId: { not: scope!.tenantId } },
      select: { id: true },
    });
    if (taken) return NextResponse.json({ success: false, error: "That domain is already in use" }, { status: 409 });
  }

  const subdomain = input.subdomain ? input.subdomain : null;
  if (subdomain) {
    if (!platformRootDomain()) {
      return NextResponse.json({ success: false, error: "Free subdomains aren't enabled on this platform" }, { status: 400 });
    }
    if (!isClaimableSubdomain(subdomain)) {
      return NextResponse.json({ success: false, error: "Subdomain: 3–30 lowercase letters, digits or hyphens" }, { status: 400 });
    }
    const taken = await prisma.whiteLabelConfig.findFirst({
      where: { subdomain, tenantId: { not: scope!.tenantId } },
      select: { id: true },
    });
    if (taken) return NextResponse.json({ success: false, error: "That subdomain is taken" }, { status: 409 });
  }

  const previous = await prisma.whiteLabelConfig.findUnique({ where: { tenantId: scope!.tenantId }, select: { domain: true } });
  const data = {
    brandName: input.brandName,
    logoUrl: blank(input.logoUrl),
    faviconUrl: blank(input.faviconUrl),
    primaryColor: input.primaryColor.toLowerCase(),
    accentColor: blank(input.accentColor)?.toLowerCase() ?? null,
    domain,
    supportEmail: blank(input.supportEmail),
    supportPhone: blank(input.supportPhone),
    website: blank(input.website),
    address: blank(input.address),
    loginHeadline: blank(input.loginHeadline),
    loginSubtext: blank(input.loginSubtext),
    ...(input.subdomain !== undefined && { subdomain }),
    ...(input.landingEnabled !== undefined && { landingEnabled: input.landingEnabled }),
    ...(input.landingTitle !== undefined && { landingTitle: blank(input.landingTitle) }),
    ...(input.landingSubtitle !== undefined && { landingSubtitle: blank(input.landingSubtitle) }),
    ...(input.termsContent !== undefined && { termsContent: blank(input.termsContent?.trim()) }),
    ...(input.privacyContent !== undefined && { privacyContent: blank(input.privacyContent?.trim()) }),
    ...(input.isActive !== undefined && { isActive: input.isActive }),
  };

  try {
    const config = await prisma.whiteLabelConfig.upsert({
      where: { tenantId: scope!.tenantId },
      create: { tenantId: scope!.tenantId, ...data },
      update: data,
    });
    await prisma.auditLog.create({
      data: {
        tenantId: scope!.tenantId,
        userId: scope!.userId,
        action: "WHITE_LABEL_UPDATED",
        resource: "white_label",
        resourceId: config.id,
        metadata: { domain, brandName: data.brandName },
      },
    });
    invalidateBrandCache();

    let domainStatus: DomainResult | null = null;
    if (domain && domain !== previous?.domain) domainStatus = await attachDomain(domain);

    return NextResponse.json({ success: true, data: config, domainStatus });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json({ success: false, error: "That domain or subdomain is already in use" }, { status: 409 });
    }
    console.error("[RESELLER BRANDING PUT]", error);
    return NextResponse.json({ success: false, error: "Failed to save branding" }, { status: 500 });
  }
}
