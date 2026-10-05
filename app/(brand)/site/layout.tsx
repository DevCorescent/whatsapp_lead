// ============================================================================
// LAYOUT : White-label brand site
//
// Served on a white-label reseller's domain or free subdomain in place of the
// platform's marketing site (proxy.ts rewrites "/" → /site, "/terms" →
// /site/terms, "/privacy-policy" → /site/privacy). Same visual language as the
// platform's own site — the brand colour re-points the emerald palette
// (lib/branding#brandStyle) — with the brand's name, logo and contact details,
// and no mention of the platform.
// ============================================================================

import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { brandStyle, getRequestBrand } from "@/lib/branding";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getRequestBrand();
  return {
    title: brand.name,
    description: brand.landingSubtitle ?? brand.loginSubtext,
    ...(brand.faviconUrl && { icons: { icon: brand.faviconUrl } }),
  };
}

export default async function BrandSiteLayout({ children }: { children: ReactNode }) {
  const brand = await getRequestBrand();
  // An address pointed here that no live reseller owns (unclaimed domain, mistyped or
  // suspended subdomain). Not back to "/": on this host that rewrites to /site again.
  if (!brand.isWhiteLabel) redirect("/login");
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900" style={brandStyle(brand)}>
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- the reseller's own logo
              <img src={brand.logoUrl} alt="" className="h-8 w-8 rounded-lg object-contain" />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 shadow-sm shadow-emerald-600/30">
                <MessageSquare className="h-4 w-4 text-white" />
              </span>
            )}
            <span className="truncate text-base font-bold tracking-tight">{brand.name}</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex" aria-label="Main">
            <Link href="/#features" className="hover:text-slate-900">Features</Link>
            <Link href="/#pricing" className="hover:text-slate-900">Pricing</Link>
            <Link href="/#contact" className="hover:text-slate-900">Contact</Link>
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Sign in</Link>
            <Link
              href="/register"
              className="rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-emerald-600/25 transition hover:bg-emerald-700"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© {year} {brand.legalName}</p>
          <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Legal">
            <Link href="/terms" className="hover:text-slate-900">Terms of service</Link>
            <Link href="/privacy-policy" className="hover:text-slate-900">Privacy policy</Link>
            {brand.supportEmail && <a href={`mailto:${brand.supportEmail}`} className="break-all hover:text-slate-900">{brand.supportEmail}</a>}
          </nav>
        </div>
      </footer>
    </div>
  );
}
