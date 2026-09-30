import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      tenantId: string;
      tenantSlug: string;
      tenantName: string;
      /** PLATFORM | RESELLER | CLIENT — see prisma AccountType. */
      accountType: string;
      /** NORMAL | WHITE_LABEL for resellers, else null. */
      resellerType: string | null;
      /** The reseller account this client belongs to, if any. */
      parentTenantId: string | null;
      avatar?: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: string;
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    accountType: string;
    resellerType: string | null;
    parentTenantId: string | null;
    avatar?: string;
  }
}

// The JWT interface must be augmented on "@auth/core/jwt", not "next-auth/jwt". The latter is a
// bare `export * from "@auth/core/jwt"` re-export and declares nothing of its own, so augmenting it
// creates a second, unrelated interface that the callbacks never see. Because the real JWT extends
// Record<string, unknown>, the mismatch does not fail loudly — every `token.x` silently degrades to
// `unknown`, which is what forced the `as string` casts this file was supposed to make unnecessary.
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: string;
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    accountType?: string;
    resellerType?: string | null;
    parentTenantId?: string | null;
    avatar?: string;
    /** When the claims above were last read from the database (ms). */
    claimsAt?: number;
  }
}
