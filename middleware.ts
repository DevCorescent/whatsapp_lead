import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

// Built from the edge-safe config, NOT from lib/auth.ts — importing that here
// drags Prisma and the pg driver into the Edge bundle, which cannot load them.
const { auth } = NextAuth(authConfig);

const PUBLIC_ROUTES = ["/", "/pricing", "/features", "/about", "/blog", "/contact", "/industries", "/privacy-policy", "/terms", "/refund-policy"];
const AUTH_ROUTES = ["/login", "/register", "/forgot-password"];
const ADMIN_ROUTE_PREFIX = "/admin";

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

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)" ],
};
