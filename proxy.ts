import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { isPlatformHost } from "@/lib/hosts";

// Built from the edge-safe config, NOT from lib/auth.ts — importing that here
// drags Prisma and the pg driver into the Edge bundle, which cannot load them.
const { auth } = NextAuth(authConfig);

/**
 * Every route under app/(marketing), and the only list that decides what a signed-out
 * visitor can see.
 *
 * IT FAILS CLOSED, which is correct — an unlisted route redirects to /login rather
 * than leaking a dashboard — but it means ADDING A MARKETING PAGE IS TWO EDITS: the
 * `page.tsx`, and this array. Miss the second and the new page silently bounces
 * everyone to the login screen, which looks like a broken link rather than a missing
 * permission and is therefore reported as one.
 *
 * Matching is exact-or-prefix (`/blog` also covers `/blog/:slug`), so nested routes
 * need only their root listed here.
 */
const PUBLIC_ROUTES = [
  "/",
  // Product
  "/features",
  "/solutions",
  "/industries",
  "/pricing",
  "/portfolio",
  "/resources",
  // Company
  "/about",
  "/why-choose-us",
  "/become-a-partner",
  "/careers",
  "/contact",
  // Developers
  "/documentation",
  "/api-docs",
  "/api-reference",
  "/blog",
  "/site-map",
  // Legal
  "/privacy-policy",
  "/terms",
  "/refund-policy",
  "/security",
  "/cookies",
];
const AUTH_ROUTES = ["/login", "/register", "/forgot-password", "/reset-password"];
const ADMIN_ROUTE_PREFIX = "/admin";

/** Agents only get ops surfaces — not Team / Settings / Automate admin. */
const AGENT_ALLOWED_PREFIXES = ["/inbox", "/contacts", "/leads", "/tickets"];
const AGENT_BLOCKED_PREFIXES = [
  "/team",
  "/settings",
  "/campaigns",
  "/segments",
  "/broadcast",
  "/blacklist",
  "/wallet",
  "/chatbot",
  "/ai-settings",
  "/knowledge-base",
  "/analytics",
  "/templates",
  "/businesses",
];

/**
 * What a RESELLER account's users may reach. Fail-closed allowlists: a reseller
 * manages client accounts and never acts inside one, so every client feature —
 * inbox, contacts, campaigns, templates, chatbot, analytics, search, media — is
 * off-limits, including ones added later that nobody remembers to list here.
 *
 * This is the first of several layers: getBusinessScope() refuses reseller
 * accounts from the database, and requirePermission() caps them by account type.
 * The session's accountType is refreshed from the database every few minutes.
 */
const RESELLER_PAGE_PREFIXES = ["/reseller", "/team", "/settings", "/billing", "/wallet"];
const RESELLER_API_PREFIXES = ["/api/reseller", "/api/team", "/api/settings", "/api/billing", "/api/wallet", "/api/account", "/api/auth"];
/** Client-only corners inside otherwise-allowed API areas. */
const RESELLER_API_BLOCKED = ["/api/settings/whatsapp"];

const matches = (pathname: string, prefixes: string[]) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(`${p}-`));

/** Where a signed-in user lands. */
function homeFor(user: { role?: string; accountType?: string } | undefined): string {
  if (user?.role === "SUPER_ADMIN") return "/dashboard";
  if (user?.accountType === "RESELLER") return "/reseller";
  return "/inbox";
}

export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  const pathname = nextUrl.pathname;
  const isLoggedIn = !!session?.user;
  const isReseller = session?.user?.accountType === "RESELLER" && session.user.role !== "SUPER_ADMIN";

  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    if (isReseller && (!matches(pathname, RESELLER_API_PREFIXES) || matches(pathname, RESELLER_API_BLOCKED))) {
      return NextResponse.json(
        { success: false, error: "Reseller accounts can't access client data or send messages" },
        { status: 403 },
      );
    }
    return NextResponse.next();
  }

  if (pathname.startsWith(ADMIN_ROUTE_PREFIX)) {
    if (!isLoggedIn) return NextResponse.redirect(new URL("/login", nextUrl));
    if (session?.user?.role !== "SUPER_ADMIN") return NextResponse.redirect(new URL(homeFor(session?.user), nextUrl));
    return NextResponse.next();
  }

  if (AUTH_ROUTES.some((r) => pathname.startsWith(r))) {
    if (isLoggedIn) return NextResponse.redirect(new URL(homeFor(session?.user), nextUrl));
    return NextResponse.next();
  }

  const whiteLabelHost = !isPlatformHost(req.headers.get("host") ?? "");

  // The brand site (landing + legal pages) exists only on white-label hosts, where it is
  // reached through the rewrites below. On the platform's own host it doesn't exist.
  if (pathname === "/site" || pathname.startsWith("/site/")) {
    return whiteLabelHost ? NextResponse.next() : NextResponse.redirect(new URL("/", nextUrl));
  }

  if (PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    // Any host that isn't the platform's is a white-label reseller's domain or subdomain:
    // it serves that brand's own site (app/(brand)/site, branded by lib/branding.ts)
    // instead of the platform's marketing pages.
    if (whiteLabelHost) {
      if (pathname === "/") {
        if (isLoggedIn) return NextResponse.redirect(new URL(homeFor(session?.user), nextUrl));
        return NextResponse.rewrite(new URL("/site", nextUrl));
      }
      if (pathname === "/terms") return NextResponse.rewrite(new URL("/site/terms", nextUrl));
      if (pathname === "/privacy-policy") return NextResponse.rewrite(new URL("/site/privacy", nextUrl));
      const home = new URL("/", nextUrl);
      if (pathname === "/pricing") home.hash = "pricing";
      return NextResponse.redirect(home);
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isReseller && !matches(pathname, RESELLER_PAGE_PREFIXES)) {
    return NextResponse.redirect(new URL("/reseller", nextUrl));
  }
  // The reseller panel is for reseller accounts only (its APIs refuse everyone else too).
  // The Super Admin may open it while viewing a reseller account (lib/viewAs.ts); the
  // page layout and the reseller APIs check the account itself.
  if (!isReseller && session?.user?.role !== "SUPER_ADMIN" && matches(pathname, ["/reseller"])) {
    return NextResponse.redirect(new URL(homeFor(session?.user), nextUrl));
  }

  if (session?.user?.role === "AGENT") {
    const blocked = AGENT_BLOCKED_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
    const allowed = AGENT_ALLOWED_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
    if (blocked || !allowed) {
      return NextResponse.redirect(new URL("/inbox", nextUrl));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)" ],
};
