// ============================================================================
// MODULE : Role-based permissions
//
// The single answer to "may this user do that?", asked by every API route that
// needs more than "is signed in". A user's permissions are the intersection of:
//
//   1. the ACCOUNT CEILING — what any user of that kind of account may ever do.
//      Code, not data. A RESELLER account can never hold a messaging or chat
//      permission, whatever anyone configures: resellers manage accounts, they
//      never send as a client or read a client's conversations.
//   2. the ROLE DEFAULTS below, per staff role inside the account;
//   3. super-admin OVERRIDES stored in RolePermission (per account type + role),
//      which can grant or revoke within the ceiling but never beyond it.
//
// SUPER_ADMIN (the platform operator) holds everything.
//
// Routes call `await requirePermission(principal, "…")`, where the principal is
// the request's scope (role + account type). Business-scoped routes get the
// account type fresh from the database via getBusinessScope; the session carries
// it too, refreshed from the database every few minutes (lib/auth.ts).
// ============================================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const PERMISSIONS = [
  // Client (business) features
  "contacts.view",
  "contacts.manage",
  "contacts.import",
  "contacts.export",
  "conversations.view",
  "messages.send",
  "campaigns.view",
  "campaigns.send",
  "templates.manage",
  "blacklist.view",
  "blacklist.manage",
  "reports.view",
  // Account administration (any account type)
  "users.manage",
  "billing.manage",
  "settings.manage",
  // Reseller features
  "reseller.clients.view",
  "reseller.clients.manage",
  "reseller.plans.manage",
  "reseller.commissions.view",
  "whitelabel.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type AccountKind = "PLATFORM" | "RESELLER" | "CLIENT";

/** Who is asking. `accountType` missing means a client account (the default). */
export interface Principal {
  role: string;
  accountType?: string | null;
  resellerType?: string | null;
}

const ALL: readonly Permission[] = PERMISSIONS;

const CLIENT_FEATURES: Permission[] = [
  "contacts.view", "contacts.manage", "contacts.import", "contacts.export",
  "conversations.view", "messages.send",
  "campaigns.view", "campaigns.send", "templates.manage",
  "blacklist.view", "blacklist.manage", "reports.view",
];
const ACCOUNT_ADMIN: Permission[] = ["users.manage", "billing.manage", "settings.manage"];
const RESELLER_FEATURES: Permission[] = [
  "reseller.clients.view", "reseller.clients.manage", "reseller.plans.manage", "reseller.commissions.view",
];

/** The most any user of this kind of account can hold. Not configurable. */
export function accountCeiling(accountType?: string | null, resellerType?: string | null): readonly Permission[] {
  switch (accountType) {
    case "PLATFORM":
      return ALL;
    case "RESELLER":
      return [
        ...RESELLER_FEATURES,
        ...ACCOUNT_ADMIN,
        ...(resellerType === "WHITE_LABEL" ? (["whitelabel.manage"] as Permission[]) : []),
      ];
    default:
      return [...CLIENT_FEATURES, ...ACCOUNT_ADMIN];
  }
}

/** Default permissions per staff role, before the account ceiling and overrides. */
const ROLE_DEFAULTS: Record<string, readonly Permission[]> = {
  SUPER_ADMIN: ALL,
  TENANT_OWNER: ALL,
  // Admins could always pay for and change the plan (the billing routes allowed
  // SUPER_ADMIN, TENANT_OWNER and ADMIN), so they keep billing.manage.
  ADMIN: ALL,
  MANAGER: [
    "contacts.view", "contacts.manage", "contacts.import", "contacts.export",
    "conversations.view", "messages.send",
    "campaigns.view", "campaigns.send", "templates.manage",
    "blacklist.view", "reports.view",
    "reseller.clients.view", "reseller.commissions.view",
  ],
  MARKETING_USER: [
    "contacts.view", "contacts.manage", "contacts.import",
    "conversations.view", "messages.send",
    "campaigns.view", "campaigns.send", "templates.manage",
    "blacklist.view", "reports.view",
    "reseller.clients.view",
  ],
  // Agents work conversations: they see and edit the contacts they talk to, but
  // don't bulk-import, export, broadcast or change the blacklist.
  AGENT: ["contacts.view", "contacts.manage", "conversations.view", "messages.send"],
};

export function roleDefaults(role: string): readonly Permission[] {
  return ROLE_DEFAULTS[role] ?? [];
}

// ─── Overrides (RolePermission table) ────────────────────────────────────────

const OVERRIDE_TTL_MS = 30_000;
let overrideCache: { at: number; map: Map<string, boolean> } | null = null;

const overrideKey = (accountType: string, role: string, permission: string) => `${accountType}:${role}:${permission}`;

async function overrides(): Promise<Map<string, boolean>> {
  if (overrideCache && Date.now() - overrideCache.at < OVERRIDE_TTL_MS) return overrideCache.map;
  const rows = await prisma.rolePermission.findMany({
    select: { accountType: true, role: true, permission: true, allowed: true },
  });
  const map = new Map(rows.map((r) => [overrideKey(r.accountType, r.role, r.permission), r.allowed]));
  overrideCache = { at: Date.now(), map };
  return map;
}

/** Drop the cached overrides — call after editing RolePermission rows. */
export function invalidatePermissionCache() {
  overrideCache = null;
}

/**
 * The pure rule, given the override table. Exported for tests and for the admin
 * matrix screen.
 */
export function resolvePermission(
  principal: Principal | null | undefined,
  permission: Permission,
  overrideMap: Map<string, boolean> = new Map(),
): boolean {
  if (!principal?.role) return false;
  if (principal.role === "SUPER_ADMIN") return true;

  const accountType = principal.accountType ?? "CLIENT";
  if (!accountCeiling(accountType, principal.resellerType).includes(permission)) return false;

  const override = overrideMap.get(overrideKey(accountType, principal.role, permission));
  if (override !== undefined) return override;
  return roleDefaults(principal.role).includes(permission);
}

export async function can(principal: Principal | null | undefined, permission: Permission): Promise<boolean> {
  if (!principal?.role) return false;
  if (principal.role === "SUPER_ADMIN") return true;
  return resolvePermission(principal, permission, await overrides());
}

/** 403 response for a missing permission, or null when the principal has it. */
export async function requirePermission(
  principal: Principal | null | undefined,
  permission: Permission,
): Promise<NextResponse | null> {
  if (await can(principal, permission)) return null;
  return NextResponse.json(
    { success: false, error: "You don't have permission to do this" },
    { status: 403 },
  );
}

/** Every permission the principal holds — for the client, to hide what it can't use. */
export async function permissionsFor(principal: Principal | null | undefined): Promise<Permission[]> {
  if (!principal?.role) return [];
  const map = principal.role === "SUPER_ADMIN" ? new Map<string, boolean>() : await overrides();
  return PERMISSIONS.filter((p) => resolvePermission(principal, p, map));
}
