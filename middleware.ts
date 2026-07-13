import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that don't need authentication
const PUBLIC_ROUTES = ["/", "/pricing", "/features", "/about", "/blog", "/contact", "/industries", "/privacy-policy", "/terms", "/refund-policy"];
const AUTH_ROUTES = ["/login", "/register", "/forgot-password"];
const ADMIN_ROUTES = ["/admin"];

export default auth((req) => {
  const { nextUrl, auth: session } = req as NextRequest & { auth: any };
  const pathname = nextUrl.pathname;
  const isLoggedIn = !!session?.user;

  // Allow public marketing routes and API routes
  if (pathname.startsWith("/api/") || pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  // Block admin routes for non super-admins
  if (pathname.startsWith("/admin")) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/login", nextUrl));
    }
    if (session?.user?.role !== "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/inbox", nextUrl));
    }
    return NextResponse.next();
  }

  // Redirect logged-in users away from auth pages
  if (AUTH_ROUTES.some((r) => pathname.startsWith(r))) {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL("/inbox", nextUrl));
    }
    return NextResponse.next();
  }

  // Public marketing routes
  if (PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    return NextResponse.next();
  }

  // All other routes require authentication (dashboard)
  if (!isLoggedIn) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)"],
};
