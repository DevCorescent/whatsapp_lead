import type { NextAuthConfig } from "next-auth";

/**
 * The edge-safe half of the NextAuth config: no providers, no Prisma, no bcrypt.
 *
 * middleware.ts runs on the Edge runtime, where the pg driver that lib/auth.ts
 * pulls in transitively cannot load ("Native module not found: node:util/types",
 * which 500s every route). Sessions are JWTs, so the middleware only needs to
 * decode the cookie — it never has to reach the database. lib/auth.ts keeps the
 * Credentials provider and stays on the Node runtime.
 */
export const authConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [],
  callbacks: {
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as string;
      session.user.tenantId = token.tenantId as string;
      session.user.tenantSlug = token.tenantSlug as string;
      session.user.tenantName = token.tenantName as string;
      session.user.avatar = token.avatar as string | undefined;
      return session;
    },
  },
} satisfies NextAuthConfig;
