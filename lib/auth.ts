import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

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
        token.avatar = user.avatar;
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
      session.user.avatar = token.avatar;
      return session;
    },
  },
});
