// ============================================================================
// OWNER  : Contacts
// MODULE : Contact bulk import
// ROUTE  : /api/contacts/import
//
// METHODS
// POST   - Bulk-import contacts from a parsed spreadsheet. `dryRun` validates and
//          reports the new/existing split without writing; a real run creates and
//          (optionally) updates contacts, honouring the caller's skip/update choice.
//
// ACCESS
// POST   - Authenticated. Same permission as creating a contact (any authenticated
//          member of the tenant). Every write is scoped to session.user.tenantId, so
//          an import can only ever land in the caller's own workspace.
// ============================================================================
//
// Reuses the existing Contact upsert path and the shared import rules in
// `lib/contactsImport`, which the client applies too — the server re-runs them as the
// final authority so a forged or oversized payload can never bypass validation.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import {
  IMPORT_MAX_ROWS,
  isValidEmail,
  isValidPhone,
  normalizePhone,
  type ImportResult,
} from "@/lib/contactsImport";

/** Rows per transaction — keeps each atomic batch well inside the transaction timeout. */
const BATCH_SIZE = 100;

const importRowSchema = z.object({
  name: z.string().optional(),
  phone: z.string(),
  email: z.string().optional(),
  company: z.string().optional(),
  designation: z.string().optional(),
  location: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const importSchema = z.object({
  contacts: z
    .array(importRowSchema)
    .min(1, "No contacts to import")
    .max(IMPORT_MAX_ROWS, `Max ${IMPORT_MAX_ROWS} contacts per import`),
  mode: z.enum(["skip", "update"]).default("skip"),
  dryRun: z.boolean().default(false),
});

type CleanContact = {
  name: string;
  phone: string;
  email?: string;
  company?: string;
  designation?: string;
  location?: string;
  source?: string;
  notes?: string;
  tags: string[];
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function POST(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId, businessId, userId } = scope;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { contacts, mode, dryRun } = parsed.data;

  try {
    // Server-side validation is the authority: normalise, check phone/email, and drop
    // within-payload duplicates (last occurrence wins). Invalid rows are counted, never written.
    const errors: ImportResult["errors"] = [];
    const byPhone = new Map<string, CleanContact>();
    let failed = 0;

    for (const row of contacts) {
      const phone = normalizePhone(row.phone);
      const email = row.email?.trim() || undefined;

      if (!isValidPhone(phone)) {
        failed++;
        if (errors.length < 50) errors.push({ ref: row.phone, reason: "Invalid phone number" });
        continue;
      }
      if (email && !isValidEmail(email)) {
        failed++;
        if (errors.length < 50) errors.push({ ref: phone, reason: "Invalid email address" });
        continue;
      }

      byPhone.set(phone, {
        name: row.name?.trim() || phone,
        phone,
        email,
        company: row.company?.trim() || undefined,
        designation: row.designation?.trim() || undefined,
        location: row.location?.trim() || undefined,
        source: row.source?.trim() || undefined,
        notes: row.notes?.trim() || undefined,
        tags: (row.tags ?? []).map((t) => t.trim()).filter(Boolean),
      });
    }

    const clean = [...byPhone.values()];
    const phones = clean.map((c) => c.phone);

    // One indexed query resolves the whole batch's new-vs-existing split (tenant-scoped).
    const existingRows = phones.length
      ? await prisma.contact.findMany({
          where: { tenantId, phone: { in: phones } },
          select: { phone: true },
        })
      : [];
    const existing = new Set(existingRows.map((r) => r.phone));
    const existingCount = clean.filter((c) => existing.has(c.phone)).length;
    const newCount = clean.length - existingCount;

    // Dry run — power the preview's new/update split without writing anything.
    if (dryRun) {
      const result: ImportResult = {
        total: contacts.length,
        created: 0,
        updated: 0,
        skipped: mode === "skip" ? existingCount : 0,
        failed,
        newCount,
        existingCount,
        errors,
      };
      return NextResponse.json({ success: true, data: result });
    }

    // Resolve every distinct tag name to an id once, up front — avoids re-upserting the
    // same tag per row. Tags are created on demand, scoped to the business.
    const tagNames = [...new Set(clean.flatMap((c) => c.tags))];
    const tagIdByName = new Map<string, string>();
    for (const name of tagNames) {
      const tag = await prisma.tag.upsert({
        where: { name_businessId: { name, businessId } },
        create: { name, tenantId, businessId },
        update: {},
        select: { id: true, name: true },
      });
      tagIdByName.set(tag.name, tag.id);
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const batch of chunk(clean, BATCH_SIZE)) {
      await prisma.$transaction(
        async (tx) => {
          for (const c of batch) {
            const exists = existing.has(c.phone);

            // Skip mode leaves existing contacts untouched; update mode upserts.
            if (mode === "skip" && exists) {
              skipped++;
              continue;
            }

            const contact = await tx.contact.upsert({
              where: { phone_businessId: { phone: c.phone, businessId } },
              create: {
                tenantId,
                businessId,
                phone: c.phone,
                name: c.name,
                email: c.email,
                company: c.company,
                designation: c.designation,
                location: c.location,
                source: c.source ?? "IMPORT",
                ...(c.notes && { notes: c.notes }),
              },
              update: {
                name: c.name,
                ...(c.email && { email: c.email }),
                ...(c.company && { company: c.company }),
                ...(c.designation && { designation: c.designation }),
                ...(c.location && { location: c.location }),
                ...(c.source && { source: c.source }),
                ...(c.notes && { notes: c.notes }),
              },
              select: { id: true },
            });

            // Link tags idempotently (create-if-absent on the join row).
            for (const tagName of c.tags) {
              const tagId = tagIdByName.get(tagName);
              if (!tagId) continue;
              await tx.contactTag.upsert({
                where: { contactId_tagId: { contactId: contact.id, tagId } },
                create: { contactId: contact.id, tagId },
                update: {},
              });
            }

            if (exists) updated++;
            else created++;
          }
        },
        { timeout: 30_000 },
      );
    }

    // One summary audit entry rather than thousands of per-contact rows.
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: "CONTACTS_IMPORTED",
        resource: "contact",
        metadata: { created, updated, skipped, failed, mode, total: contacts.length },
      },
    });

    const result: ImportResult = {
      total: contacts.length,
      created,
      updated,
      skipped,
      failed,
      errors,
    };
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("[CONTACTS IMPORT]", error.code, error.message);
    } else {
      console.error("[CONTACTS IMPORT]", error);
    }
    return NextResponse.json({ success: false, error: "Import failed" }, { status: 500 });
  }
}
