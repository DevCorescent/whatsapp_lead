import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

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
  "/chatbot",
  "/ai-settings",
  "/knowledge-base",
  "/analytics",
  "/templates",
  "/businesses",
];

export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  const pathname = nextUrl.pathname;
  const isLoggedIn = !!session?.user;

  if (pathname.startsWith("/api/") || pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  if (pathname.startsWith(ADMIN_ROUTE_PREFIX)) {
    if (!isLoggedIn) return NextResponse.redirect(new URL("/login", nextUrl));
    if (session?.user?.role !== "SUPER_ADMIN") return NextResponse.redirect(new URL("/inbox", nextUrl));
    return NextResponse.next();
  }

  if (AUTH_ROUTES.some((r) => pathname.startsWith(r))) {
    if (isLoggedIn) return NextResponse.redirect(new URL("/inbox", nextUrl));
    return NextResponse.next();
  }

  if (PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
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
