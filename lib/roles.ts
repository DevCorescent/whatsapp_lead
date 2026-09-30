// ============================================================================
// MODULE : Staff role ranking
//
// Who may give which role to whom inside an account. Before this, the team API
// accepted any UserRole — so a Manager could invite a SUPER_ADMIN (a platform-wide
// operator with access to every account), and an Admin could promote themselves
// or demote the owner.
//
// Rules:
//   · SUPER_ADMIN is never assignable from an account's team screen.
//   · You can assign only roles ranked below your own; an owner can also make
//     another owner (ownership transfer).
//   · You can change or deactivate only members ranked below you; an owner can
//     manage anyone in the account except that the last active owner can't be
//     removed or demoted.
// ============================================================================

import { randomBytes } from "crypto";

export const STAFF_RANK: Record<string, number> = {
  TENANT_OWNER: 4,
  ADMIN: 3,
  MANAGER: 2,
  MARKETING_USER: 1,
  AGENT: 1,
};

export function rankOf(role: string): number {
  if (role === "SUPER_ADMIN") return 5;
  return STAFF_RANK[role] ?? 0;
}

/** Whether `callerRole` may give a member `targetRole`. */
export function canAssignRole(callerRole: string, targetRole: string): boolean {
  if (targetRole === "SUPER_ADMIN" || !(targetRole in STAFF_RANK)) return false;
  if (callerRole === "SUPER_ADMIN" || callerRole === "TENANT_OWNER") return true;
  return rankOf(targetRole) < rankOf(callerRole);
}

/** Whether `callerRole` may change or deactivate a member who holds `memberRole`. */
export function canManageMember(callerRole: string, memberRole: string): boolean {
  if (memberRole === "SUPER_ADMIN") return callerRole === "SUPER_ADMIN";
  if (callerRole === "SUPER_ADMIN" || callerRole === "TENANT_OWNER") return true;
  return rankOf(memberRole) < rankOf(callerRole);
}

/** A temporary password from the CSPRNG (Math.random is predictable). 16 chars + class mix. */
export function generateTempPassword(): string {
  return `${randomBytes(12).toString("base64url")}A1!`;
}
