// ============================================================================
// MODULE : Customer segments — rules → contact query
//
// Turns validated segment rules (lib/segmentRules.ts) into a Prisma where-clause,
// always scoped to the account and business and excluding deleted contacts. Only
// fixed columns and operators are ever used, so no rule can reach another
// account's data or run arbitrary SQL.
//
// Status "blacklisted" / "active" consult the blacklist (account + platform-wide),
// which isn't a relation on Contact, so its phones are looked up first.
// ============================================================================

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SegmentRule } from "@/lib/segmentRules";

async function blacklistedPhones(tenantId: string): Promise<string[]> {
  const rows = await prisma.blacklistEntry.findMany({
    where: { OR: [{ tenantId }, { tenantId: null }] },
    select: { phone: true },
  });
  return rows.map((r) => r.phone);
}

function textRule(field: "name" | "location" | "company" | "source" | "email", op: "is" | "contains", values: string[]): Prisma.ContactWhereInput {
  return {
    OR: values.map((v) => ({
      [field]: op === "is" ? { equals: v, mode: "insensitive" } : { contains: v, mode: "insensitive" },
    })),
  };
}

export async function segmentWhere(
  tenantId: string,
  businessId: string,
  rules: SegmentRule[],
): Promise<Prisma.ContactWhereInput> {
  const and: Prisma.ContactWhereInput[] = [];
  let blocked: string[] | null = null;
  const getBlocked = async () => (blocked ??= await blacklistedPhones(tenantId));

  for (const rule of rules) {
    switch (rule.field) {
      case "name":
      case "location":
      case "company":
      case "source":
      case "email":
        and.push(textRule(rule.field, rule.op, rule.values));
        break;
      case "tags":
        if (rule.op === "any") and.push({ tags: { some: { tagId: { in: rule.values } } } });
        else if (rule.op === "none") and.push({ tags: { none: { tagId: { in: rule.values } } } });
        else for (const tagId of rule.values) and.push({ tags: { some: { tagId } } });
        break;
      case "leadStage":
        and.push({ leads: { some: { stageId: { in: rule.values } } } });
        break;
      case "status": {
        const any: Prisma.ContactWhereInput[] = [];
        for (const s of rule.values) {
          if (s === "opted_out") any.push({ optedOut: true });
          if (s === "blacklisted") any.push({ phone: { in: await getBlocked() } });
          if (s === "active") any.push({ optedOut: false, phone: { notIn: await getBlocked() } });
        }
        and.push({ OR: any });
        break;
      }
      case "custom":
        and.push({
          OR: rule.values.map((v) => ({
            customFields: rule.op === "is"
              ? { path: [rule.key], equals: v }
              : { path: [rule.key], string_contains: v },
          })),
        });
        break;
    }
  }

  return { tenantId, businessId, isBlocked: false, ...(and.length && { AND: and }) };
}

/** Distinct values to offer in the builder's pick-lists. */
export async function segmentFieldOptions(tenantId: string, businessId: string) {
  const [locations, sources, tags, stages, keys] = await Promise.all([
    prisma.contact.groupBy({
      by: ["location"],
      where: { tenantId, businessId, isBlocked: false, location: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { location: "desc" } },
      take: 200,
    }),
    prisma.contact.groupBy({
      by: ["source"],
      where: { tenantId, businessId, isBlocked: false, source: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { source: "desc" } },
      take: 100,
    }),
    prisma.tag.findMany({ where: { tenantId, businessId }, select: { id: true, name: true, color: true }, orderBy: { name: "asc" } }),
    prisma.pipelineStage.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { order: "asc" } }),
    prisma.$queryRaw<{ key: string }[]>`
      SELECT DISTINCT jsonb_object_keys("customFields"::jsonb) AS key
      FROM contacts
      WHERE "tenantId" = ${tenantId} AND "businessId" = ${businessId}
        AND "customFields" IS NOT NULL AND jsonb_typeof("customFields"::jsonb) = 'object'
      LIMIT 100
    `,
  ]);
  return {
    locations: locations.map((l) => ({ value: l.location!, count: l._count._all })).filter((l) => l.value.trim()),
    sources: sources.map((s) => s.source!).filter(Boolean),
    tags,
    stages,
    customKeys: keys.map((k) => k.key),
  };
}
