import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

/**
 * How long session claims (role, account type, active flags) are trusted before they
 * are re-read from the database. Sessions are JWTs, so without this a user who was
 * deactivated, demoted, or whose account was suspended or converted kept their old
 * powers until the token expired — days. The re-read is one indexed query, done at
 * most once per window per token.
 */
const CLAIMS_TTL_MS = 5 * 60_000;

/** Current claims for a user, or null when the user or their account can no longer sign in. */
async function loadClaims(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      isActive: true,
      tenant: {
        select: {
          id: true, slug: true, name: true, isActive: true,
          accountType: true, resellerType: true, parentId: true,
        },
      },
    },
  });
  if (!user || !user.isActive || !user.tenant.isActive) return null;
  return {
    role: user.role,
    tenantId: user.tenant.id,
    tenantSlug: user.tenant.slug,
    tenantName: user.tenant.name,
    accountType: user.tenant.accountType,
    resellerType: user.tenant.resellerType ?? null,
    parentTenantId: user.tenant.parentId ?? null,
  };
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const user = await prisma.user.findFirst({
          where: { email, isActive: true },
          include: { tenant: true },
        });

        if (!user || !user.tenant.isActive) return null;

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return null;

        // Block login until the user has clicked their verification link.
        // emailVerified defaults true for all accounts created before this
        // feature was added, so only new self-registered users are gated.
        if (!user.emailVerified) {
          throw new Error("EMAIL_NOT_VERIFIED");
        }

        // Update last login
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
          tenantSlug: user.tenant.slug,
          tenantName: user.tenant.name,
          accountType: user.tenant.accountType,
          resellerType: user.tenant.resellerType ?? null,
          parentTenantId: user.tenant.parentId ?? null,
          // Prisma models a missing avatar as null; the augmented NextAuth `User` models it as
          // optional. Normalising here keeps the two in agreement without widening the session type.
          avatar: user.avatar ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    // `user` is only present on the sign-in pass; on every later call the claims are already on
    // the token. The augmented User/JWT interfaces in types/next-auth.d.ts carry the tenant claims,
    // so no casts are needed — asserting `any` here would have silently discarded that contract.
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? token.id;
        token.role = user.role;
        token.tenantId = user.tenantId;
        token.tenantSlug = user.tenantSlug;
        token.tenantName = user.tenantName;
        token.accountType = user.accountType;
        token.resellerType = user.resellerType;
        token.parentTenantId = user.parentTenantId;
        token.avatar = user.avatar;
        token.claimsAt = Date.now();
        return token;
      }

      // Refresh stale claims from the database; sign out a user who can no longer sign in.
      if (!token.claimsAt || Date.now() - token.claimsAt > CLAIMS_TTL_MS) {
        const claims = await loadClaims(token.id);
        if (!claims) return null;
        Object.assign(token, claims, { claimsAt: Date.now() });
      }
      return token;
    },
    // Every tenant-scoped query in the app reads `session.user.tenantId`, so the claims are
    // projected from the token onto the session on each request.
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.tenantId = token.tenantId;
      session.user.tenantSlug = token.tenantSlug;
      session.user.tenantName = token.tenantName;
      session.user.accountType = token.accountType ?? "CLIENT";
      session.user.resellerType = token.resellerType ?? null;
      session.user.parentTenantId = token.parentTenantId ?? null;
      session.user.avatar = token.avatar;
      return session;
    },
  },
});
