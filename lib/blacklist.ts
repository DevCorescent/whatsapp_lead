// ============================================================================
// MODULE : Blacklist
//
// Numbers an account must never message. Three layers enforce it:
//
//   1. Campaign/broadcast creation excludes blacklisted recipients up front and
//      tells the user which ones (POST /api/campaigns, incl. its dry run).
//   2. The campaign send worker re-checks at send time — a number blacklisted
//      after a campaign was queued or scheduled still isn't messaged.
//   3. Every outbound send in lib/whatsapp.ts calls `blacklistReasonFor` before it
//      reaches Meta. That covers the inbox, AI and chatbot replies, FAQ sends and
//      any future code path — the layer nobody can route around.
//
// An entry belongs to one account (`tenantId`) or, when `tenantId` is null, to the
// whole platform (added by a super admin). `accountScope` is the hook for Phase 2's
// parent → child accounts: a parent's entries will apply to its children by adding
// the ancestors there, without touching any caller.
//
// Every add and removal is written to AuditLog (resource "blacklist", resourceId =
// the phone) so there is a history of who blocked or unblocked a number and why.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { isValidPhone, normalizePhone } from "@/lib/import";

export type BlacklistScope = "account" | "platform";

export interface BlacklistHit {
  reason: string | null;
  scope: BlacklistScope;
}

/** Accounts whose entries apply to `tenantId`. Phase 2 adds its parent accounts here. */
async function accountScope(tenantId: string): Promise<string[]> {
  return [tenantId];
}

/**
 * The stored forms a number might match. Contacts saved before phone normalisation
 * may lack a country code ("9876543210"), while blacklist entries are always
 * normalised ("919876543210") — so both are looked up.
 */
function candidates(phone: string): string[] {
  const digits = phone.replace(/\D/g, "");
  return [...new Set([digits, normalizePhone(digits)].filter(Boolean))];
}

/**
 * Which of `phones` are blacklisted for this account (or platform-wide), keyed by
 * the phone exactly as passed in. One query for the whole list.
 */
export async function findBlacklisted(
  tenantId: string | null,
  phones: string[],
): Promise<Map<string, BlacklistHit>> {
  const hits = new Map<string, BlacklistHit>();
  if (phones.length === 0) return hits;

  const lookup = new Map<string, string[]>(); // stored form → phones passed in
  for (const phone of phones) {
    for (const c of candidates(phone)) lookup.set(c, [...(lookup.get(c) ?? []), phone]);
  }

  const tenantIds = tenantId ? await accountScope(tenantId) : [];
  const rows = await prisma.blacklistEntry.findMany({
    where: {
      phone: { in: [...lookup.keys()] },
      OR: [{ tenantId: null }, ...(tenantIds.length ? [{ tenantId: { in: tenantIds } }] : [])],
    },
    select: { phone: true, reason: true, tenantId: true },
  });

  for (const row of rows) {
    for (const phone of lookup.get(row.phone) ?? []) {
      // An account entry and a platform entry can both match; report the account's
      // own reason, since that is the one the user can act on.
      if (hits.has(phone) && row.tenantId === null) continue;
      hits.set(phone, { reason: row.reason, scope: row.tenantId ? "account" : "platform" });
    }
  }
  return hits;
}

// ─── Send-time guard (lib/whatsapp.ts) ───────────────────────────────────────

const TENANT_CACHE_MS = 5 * 60_000;
const tenantByNumber = new Map<string, { tenantId: string | null; at: number }>();

/** The account that owns a WhatsApp phone number id, across the current and legacy stores. */
async function tenantForPhoneNumberId(phoneNumberId: string): Promise<string | null> {
  const cached = tenantByNumber.get(phoneNumberId);
  if (cached && Date.now() - cached.at < TENANT_CACHE_MS) return cached.tenantId;

  const tenantId =
    (await prisma.whatsAppIntegration.findUnique({ where: { phoneNumberId }, select: { tenantId: true } }))?.tenantId ??
    (await prisma.business.findUnique({ where: { whatsappPhoneNumberId: phoneNumberId }, select: { tenantId: true } }))?.tenantId ??
    (await prisma.tenantSettings.findFirst({ where: { waPhoneNumberId: phoneNumberId }, select: { tenantId: true } }))?.tenantId ??
    null;

  tenantByNumber.set(phoneNumberId, { tenantId, at: Date.now() });
  return tenantId;
}

/**
 * Why `to` may not be messaged from this WhatsApp number, or null when it may.
 * Called by every outbound send. Errors propagate: a send whose blacklist status
 * can't be determined does not go out.
 */
export async function blacklistReasonFor(phoneNumberId: string, to: string): Promise<BlacklistHit | null> {
  const tenantId = await tenantForPhoneNumberId(phoneNumberId);
  const hits = await findBlacklisted(tenantId, [to]);
  return hits.get(to) ?? null;
}

// ─── Management ──────────────────────────────────────────────────────────────

export interface AddResult {
  added: string[];
  alreadyListed: string[];
  invalid: string[];
}

/**
 * Blacklist numbers for an account (`tenantId`) or platform-wide (`tenantId: null`).
 * `auditTenantId` is the actor's own account, where the history rows are written —
 * for a platform-wide entry that is the super admin's account.
 */
export async function addToBlacklist(opts: {
  tenantId: string | null;
  phones: string[];
  reason?: string | null;
  userId: string;
  auditTenantId: string;
}): Promise<AddResult> {
  const invalid: string[] = [];
  const normalized = new Set<string>();
  for (const raw of opts.phones) {
    const phone = normalizePhone(raw);
    if (isValidPhone(phone)) normalized.add(phone);
    else if (raw.trim()) invalid.push(raw.trim());
  }
  const phones = [...normalized];
  if (phones.length === 0) return { added: [], alreadyListed: [], invalid };

  const existing = await prisma.blacklistEntry.findMany({
    where: { tenantId: opts.tenantId, phone: { in: phones } },
    select: { phone: true },
  });
  const listed = new Set(existing.map((e) => e.phone));
  const toAdd = phones.filter((p) => !listed.has(p));
  const reason = opts.reason?.trim() || null;

  if (toAdd.length > 0) {
    await prisma.$transaction([
      prisma.blacklistEntry.createMany({
        data: toAdd.map((phone) => ({ tenantId: opts.tenantId, phone, reason, createdById: opts.userId })),
        skipDuplicates: true,
      }),
      prisma.auditLog.createMany({
        data: toAdd.map((phone) => ({
          tenantId: opts.auditTenantId,
          userId: opts.userId,
          action: "BLACKLIST_ADDED",
          resource: "blacklist",
          resourceId: phone,
          metadata: { reason, scope: opts.tenantId ? "account" : "platform" },
        })),
      }),
    ]);
  }

  return { added: toAdd, alreadyListed: phones.filter((p) => listed.has(p)), invalid };
}

/** Remove one entry and record who unblocked it. */
export async function removeFromBlacklist(opts: {
  entry: { id: string; phone: string; tenantId: string | null; reason: string | null };
  userId: string;
  auditTenantId: string;
  note?: string | null;
}): Promise<void> {
  await prisma.$transaction([
    prisma.blacklistEntry.delete({ where: { id: opts.entry.id } }),
    prisma.auditLog.create({
      data: {
        tenantId: opts.auditTenantId,
        userId: opts.userId,
        action: "BLACKLIST_REMOVED",
        resource: "blacklist",
        resourceId: opts.entry.phone,
        metadata: {
          reason: opts.entry.reason,
          note: opts.note?.trim() || null,
          scope: opts.entry.tenantId ? "account" : "platform",
        },
      },
    }),
  ]);
}
