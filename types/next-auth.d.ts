import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      tenantId: string;
      tenantSlug: string;
      tenantName: string;
      avatar?: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: string;
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
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
    avatar?: string;
  }
}
