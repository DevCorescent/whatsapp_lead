// ============================================================================
// MODULE : Branding (white-label)
//
// Which brand a page shows. Two ways in:
//   · by HOST — the login/sign-up pages and page titles on a white-label
//     reseller's custom domain show that reseller's brand;
//   · by ACCOUNT — once signed in, a white-label reseller and every client under
//     it see the reseller's brand wherever they log in from.
// Everyone else sees the platform brand, configured by environment variables
// rather than hard-coded (NEXT_PUBLIC_BRAND_NAME, BRAND_LEGAL_NAME, …).
//
// A brand only applies while the reseller is an active WHITE_LABEL reseller and
// its config is active — downgrading a reseller to NORMAL reverts its clients to
// the platform brand without touching their data.
// ============================================================================

import type { CSSProperties } from "react";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isPlatformHost, normalizeHost, platformRootDomain, subdomainOf } from "@/lib/hosts";

export interface Brand {
  name: string;
  legalName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  accentColor: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  website: string | null;
  address: string | null;
  loginHeadline: string;
  loginSubtext: string;
  /** Base URL for links in emails, e.g. "https://crm.acme.com". */
  baseUrl: string;
  isWhiteLabel: boolean;
  resellerId: string | null;
  /** Landing page on the brand's domain (white-label only). */
  landingEnabled: boolean;
  landingTitle: string | null;
  landingSubtitle: string | null;
  termsContent: string | null;
  privacyContent: string | null;
}

export const PLATFORM_BRAND: Brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "WhatsCRM",
  legalName: process.env.BRAND_LEGAL_NAME ?? "Corescent Technologies Pvt Ltd",
  logoUrl: process.env.NEXT_PUBLIC_BRAND_LOGO_URL ?? null,
  faviconUrl: null,
  primaryColor: "#059669",
  accentColor: null,
  supportEmail: process.env.BRAND_SUPPORT_EMAIL ?? null,
  supportPhone: process.env.BRAND_SUPPORT_PHONE ?? null,
  website: process.env.NEXT_PUBLIC_APP_URL ?? null,
  address: null,
  loginHeadline: "Turn every WhatsApp chat into a qualified lead.",
  loginSubtext:
    "One workspace for your team to talk to customers, score leads with AI and close faster — all on the channel your customers already use.",
  baseUrl: (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  isWhiteLabel: false,
  resellerId: null,
  landingEnabled: false,
  landingTitle: null,
  landingSubtitle: null,
  termsContent: null,
  privacyContent: null,
};

type ConfigRow = {
  tenantId: string;
  brandName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  accentColor: string | null;
  domain: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  website: string | null;
  address: string | null;
  loginHeadline: string | null;
  loginSubtext: string | null;
  subdomain: string | null;
  landingEnabled: boolean;
  landingTitle: string | null;
  landingSubtitle: string | null;
  termsContent: string | null;
  privacyContent: string | null;
};

const CONFIG_SELECT = {
  tenantId: true, brandName: true, logoUrl: true, faviconUrl: true, primaryColor: true,
  accentColor: true, domain: true, supportEmail: true, supportPhone: true, website: true,
  address: true, loginHeadline: true, loginSubtext: true, subdomain: true, landingEnabled: true,
  landingTitle: true, landingSubtitle: true, termsContent: true, privacyContent: true,
} as const;

/** Only an active config of an active WHITE_LABEL reseller counts. */
const LIVE_CONFIG = {
  isActive: true,
  // Suspended by the platform (e.g. unpaid white-label fee) → the platform brand shows.
  suspendedAt: null,
  tenant: { accountType: "RESELLER" as const, resellerType: "WHITE_LABEL" as const, isActive: true },
};

function toBrand(c: ConfigRow): Brand {
  return {
    name: c.brandName,
    legalName: c.brandName,
    logoUrl: c.logoUrl,
    faviconUrl: c.faviconUrl,
    primaryColor: c.primaryColor || PLATFORM_BRAND.primaryColor,
    accentColor: c.accentColor,
    supportEmail: c.supportEmail,
    supportPhone: c.supportPhone,
    website: c.website,
    address: c.address,
    loginHeadline: c.loginHeadline || `Welcome to ${c.brandName}`,
    loginSubtext: c.loginSubtext || "Sign in to manage your customer conversations, campaigns and leads.",
    baseUrl: c.domain
      ? `https://${c.domain}`
      : c.subdomain && platformRootDomain()
        ? `https://${c.subdomain}.${platformRootDomain()}`
        : PLATFORM_BRAND.baseUrl,
    isWhiteLabel: true,
    resellerId: c.tenantId,
    landingEnabled: c.landingEnabled,
    landingTitle: c.landingTitle,
    landingSubtitle: c.landingSubtitle,
    termsContent: c.termsContent,
    privacyContent: c.privacyContent,
  };
}

// Small in-process caches — branding is read on every page render.
const TTL_MS = 60_000;
const byHost = new Map<string, { at: number; brand: Brand }>();
const byTenant = new Map<string, { at: number; brand: Brand }>();

/** Forget cached brands — call after a reseller edits its branding. */
export function invalidateBrandCache() {
  byHost.clear();
  byTenant.clear();
}

export async function getBrandForHost(host: string | null | undefined): Promise<Brand> {
  const h = normalizeHost(host);
  if (isPlatformHost(h)) return PLATFORM_BRAND;
  const hit = byHost.get(h);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.brand;

  // Its custom domain, or its free subdomain of the platform's root domain.
  const sub = subdomainOf(h);
  const config = await prisma.whiteLabelConfig.findFirst({
    where: { ...(sub ? { subdomain: sub } : { domain: h }), ...LIVE_CONFIG },
    select: CONFIG_SELECT,
  });
  const brand = config ? toBrand(config) : PLATFORM_BRAND;
  byHost.set(h, { at: Date.now(), brand });
  return brand;
}

/** The brand for the current request's host (server components and route handlers). */
export async function getRequestBrand(): Promise<Brand> {
  const h = await headers();
  return getBrandForHost(h.get("x-forwarded-host") ?? h.get("host"));
}

/** The brand an account's users see: its own (white-label reseller) or its reseller's. */
export async function getBrandForTenant(tenantId: string): Promise<Brand> {
  const hit = byTenant.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.brand;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { accountType: true, parentId: true },
  });
  const brandOwner =
    tenant?.accountType === "RESELLER" ? tenantId : tenant?.accountType === "CLIENT" ? tenant.parentId : null;

  let brand = PLATFORM_BRAND;
  if (brandOwner) {
    const config = await prisma.whiteLabelConfig.findFirst({
      where: { tenantId: brandOwner, ...LIVE_CONFIG },
      select: CONFIG_SELECT,
    });
    if (config) brand = toBrand(config);
  }
  byTenant.set(tenantId, { at: Date.now(), brand });
  return brand;
}

/** The white-label reseller that owns this host, if any — for sign-ups on its domain. */
export async function resellerForHost(host: string | null | undefined): Promise<string | null> {
  const brand = await getBrandForHost(host);
  return brand.isWhiteLabel ? brand.resellerId : null;
}

/**
 * CSS custom properties that re-point the app's `emerald` palette at the brand
 * colour. The whole UI is written in emerald utilities, which Tailwind v4 reads
 * from --color-emerald-*; overriding those on a wrapper rebrands every page
 * beneath it without touching a component. Empty for the platform brand.
 */
export function brandStyle(brand: Brand): CSSProperties {
  if (!brand.isWhiteLabel || !/^#[0-9a-f]{6}$/i.test(brand.primaryColor)) return {};
  const c = brand.primaryColor;
  const mix = (pct: number, other: "white" | "black") => `color-mix(in oklab, ${c} ${pct}%, ${other})`;
  return {
    "--color-emerald-50": mix(8, "white"),
    "--color-emerald-100": mix(16, "white"),
    "--color-emerald-200": mix(30, "white"),
    "--color-emerald-300": mix(48, "white"),
    "--color-emerald-400": mix(72, "white"),
    "--color-emerald-500": mix(90, "white"),
    "--color-emerald-600": c,
    "--color-emerald-700": mix(85, "black"),
    "--color-emerald-800": mix(70, "black"),
    "--color-emerald-900": mix(55, "black"),
  } as CSSProperties;
}
