// ============================================================================
// MODULE : Super Admin "view as"
//
// Lets the platform owner open any client or reseller account and use it as that
// account's owner would, to see or fix things for them.
//
// How: POST /api/admin/view-as sets a signed, httpOnly cookie naming the account.
// lib/auth.ts reads it in the session callback and, for a SUPER_ADMIN only, swaps
// the session's account claims (tenantId, name, type) for that account's. Every
// page and API already scopes by `session.user.tenantId`, so they all follow
// without changes. The user stays the Super Admin — `session.user.id` and `role`
// are untouched — so everything done while viewing is recorded under their name,
// and `session.user.viewAs.homeTenantId` keeps their own account for admin audit
// rows.
//
// The cookie is HMAC-signed with AUTH_SECRET, bound to the admin's user id and
// expires after VIEW_AS_TTL_MS, so it can't be forged, reused by another user, or
// left on indefinitely. Start and stop are written to the audit log.
// ============================================================================

import { createHmac, timingSafeEqual } from "node:crypto";

export const VIEW_AS_COOKIE = "admin_view_as";
export const VIEW_AS_TTL_MS = 2 * 60 * 60_000;

/** The account being viewed, as carried in the cookie (no database read per request). */
export interface ViewAsTarget {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  accountType: string;
  resellerType: string | null;
  parentTenantId: string | null;
}

interface ViewAsPayload extends ViewAsTarget {
  /** The Super Admin the cookie was issued to. */
  adminId: string;
  /** Expiry, ms since epoch. */
  exp: number;
}

function secret(): string {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

const sign = (data: string) => createHmac("sha256", secret()).update(data).digest("base64url");

export function encodeViewAs(target: ViewAsTarget, adminId: string, now = Date.now()): string {
  const payload: ViewAsPayload = { ...target, adminId, exp: now + VIEW_AS_TTL_MS };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

/** The target, when the cookie is genuine, unexpired and was issued to `adminId`; else null. */
export function decodeViewAs(value: string | undefined, adminId: string, now = Date.now()): ViewAsTarget | null {
  if (!value) return null;
  const [data, mac] = value.split(".");
  if (!data || !mac) return null;
  const expected = Buffer.from(sign(data));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(data, "base64url").toString()) as ViewAsPayload;
    if (p.adminId !== adminId || typeof p.exp !== "number" || p.exp < now || !p.tenantId) return null;
    return {
      tenantId: p.tenantId,
      tenantSlug: p.tenantSlug,
      tenantName: p.tenantName,
      accountType: p.accountType,
      resellerType: p.resellerType ?? null,
      parentTenantId: p.parentTenantId ?? null,
    };
  } catch {
    return null;
  }
}
