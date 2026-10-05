// ============================================================================
// MODULE : Contact management actions
//
// Delete / restore / block / unblock / tag, applied to many contacts at once.
// Shared by the workspace (POST /api/contacts/bulk) and the super admin's view
// of any account (POST /api/admin/tenants/[id]/contacts), so both behave the same.
//
//   delete   - soft delete (Contact.isBlocked = true): hidden from lists, history kept
//   restore  - undo a delete
//   block    - add the numbers to the account's blacklist: no message ever goes to
//              them again (lib/blacklist.ts enforces it on every send)
//   unblock  - remove the account's blacklist entries for those numbers. Platform-
//              wide entries stay; only a super admin removes those (Admin → Blacklist)
//   addTag / removeTag - by tag name, created in the contact's business if new
//
// Every contact is looked up inside `tenantId` (and `businessId` when given), so a
// caller can never act on another account's contacts by id.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { addToBlacklist, removeFromBlacklist } from "@/lib/blacklist";
import { DEFAULT_COUNTRY_CODE, normalizePhone } from "@/lib/import";

export const CONTACT_ACTIONS = ["delete", "restore", "block", "unblock", "addTag", "removeTag"] as const;
export type ContactAction = (typeof CONTACT_ACTIONS)[number];

/** Most contacts one request may change. */
export const CONTACT_ACTION_MAX = 500;

/** The permission each action needs (lib/permissions.ts). */
export const ACTION_PERMISSION = {
  delete: "contacts.delete",
  restore: "contacts.delete",
  block: "blacklist.manage",
  unblock: "blacklist.manage",
  addTag: "contacts.manage",
  removeTag: "contacts.manage",
} as const satisfies Record<ContactAction, string>;

export interface ContactActionResult {
  /** Contacts the action changed. */
  affected: number;
  /** Requested ids that were already in that state (or not found). */
  unchanged: number;
  /** unblock only: numbers still blocked by a platform-wide entry. */
  platformBlocked?: number;
}

export class ContactActionError extends Error {}

/**
 * Every stored form a blacklisted number may have on a contact. Blacklist entries
 * are always normalised ("919876543210"); older contacts may lack the country code.
 */
export async function blacklistedContactPhones(tenantId: string): Promise<string[]> {
  const rows = await prisma.blacklistEntry.findMany({
    where: { OR: [{ tenantId }, { tenantId: null }] },
    select: { phone: true },
  });
  const forms = new Set<string>();
  for (const { phone } of rows) {
    forms.add(phone);
    if (phone.startsWith(DEFAULT_COUNTRY_CODE) && phone.length === DEFAULT_COUNTRY_CODE.length + 10) {
      forms.add(phone.slice(DEFAULT_COUNTRY_CODE.length));
    }
  }
  return [...forms];
}

export async function applyContactAction(opts: {
  tenantId: string;
  /** Limit to one business (the workspace view). Omitted: any business of the account. */
  businessId?: string | null;
  ids: string[];
  action: ContactAction;
  /** block: why. */
  reason?: string | null;
  /** addTag / removeTag: the tag's name. */
  tag?: string | null;
  userId: string;
  /** Where audit rows go: the actor's own account (a super admin's, when acting on another). */
  auditTenantId: string;
}): Promise<ContactActionResult> {
  const ids = [...new Set(opts.ids)].slice(0, CONTACT_ACTION_MAX);
  const contacts = await prisma.contact.findMany({
    where: { id: { in: ids }, tenantId: opts.tenantId, ...(opts.businessId && { businessId: opts.businessId }) },
    select: { id: true, phone: true, businessId: true, isBlocked: true },
  });
  const audit = (action: string, resourceIds: string[], metadata?: Record<string, unknown>) =>
    resourceIds.length
      ? prisma.auditLog.createMany({
          data: resourceIds.map((resourceId) => ({
            tenantId: opts.auditTenantId,
            userId: opts.userId,
            action,
            resource: "contact",
            resourceId,
            metadata: { ...metadata, ...(opts.auditTenantId !== opts.tenantId && { accountId: opts.tenantId }) },
          })),
        })
      : null;

  switch (opts.action) {
    case "delete":
    case "restore": {
      const deleting = opts.action === "delete";
      const target = contacts.filter((c) => c.isBlocked !== deleting).map((c) => c.id);
      if (target.length) {
        await prisma.$transaction([
          prisma.contact.updateMany({ where: { id: { in: target } }, data: { isBlocked: deleting } }),
          audit(deleting ? "CONTACT_DELETED" : "CONTACT_RESTORED", target)!,
        ]);
      }
      return { affected: target.length, unchanged: ids.length - target.length };
    }

    case "block": {
      const result = await addToBlacklist({
        tenantId: opts.tenantId,
        phones: contacts.map((c) => c.phone),
        reason: opts.reason,
        userId: opts.userId,
        auditTenantId: opts.auditTenantId,
      });
      return { affected: result.added.length, unchanged: ids.length - result.added.length };
    }

    case "unblock": {
      const phones = [...new Set(contacts.flatMap((c) => [c.phone, normalizePhone(c.phone)]).filter(Boolean))];
      const entries = await prisma.blacklistEntry.findMany({
        where: { phone: { in: phones }, OR: [{ tenantId: opts.tenantId }, { tenantId: null }] },
        select: { id: true, phone: true, tenantId: true, reason: true },
      });
      const own = entries.filter((e) => e.tenantId === opts.tenantId);
      for (const entry of own) {
        await removeFromBlacklist({ entry, userId: opts.userId, auditTenantId: opts.auditTenantId });
      }
      const platformBlocked = entries.filter((e) => e.tenantId === null).length;
      return { affected: own.length, unchanged: Math.max(0, ids.length - own.length), platformBlocked };
    }

    case "addTag":
    case "removeTag": {
      const name = opts.tag?.trim();
      if (!name) throw new ContactActionError("Enter a tag name");
      if (name.length > 50) throw new ContactActionError("Tag names can be at most 50 characters");

      let affected = 0;
      // Tags belong to a business, so group the contacts by theirs.
      const byBusiness = new Map<string, string[]>();
      for (const c of contacts) byBusiness.set(c.businessId, [...(byBusiness.get(c.businessId) ?? []), c.id]);

      for (const [businessId, contactIds] of byBusiness) {
        if (opts.action === "addTag") {
          const tag = await prisma.tag.upsert({
            where: { name_businessId: { name, businessId } },
            create: { name, businessId, tenantId: opts.tenantId },
            update: {},
            select: { id: true },
          });
          const created = await prisma.contactTag.createMany({
            data: contactIds.map((contactId) => ({ contactId, tagId: tag.id })),
            skipDuplicates: true,
          });
          affected += created.count;
        } else {
          const tag = await prisma.tag.findUnique({ where: { name_businessId: { name, businessId } }, select: { id: true } });
          if (!tag) continue;
          const removed = await prisma.contactTag.deleteMany({ where: { tagId: tag.id, contactId: { in: contactIds } } });
          affected += removed.count;
        }
      }
      if (affected) await audit(opts.action === "addTag" ? "CONTACT_TAGGED" : "CONTACT_UNTAGGED", contacts.map((c) => c.id), { tag: name });
      return { affected, unchanged: ids.length - affected };
    }
  }
}
