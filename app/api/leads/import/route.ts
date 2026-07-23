// ============================================================================
// OWNER  : Leads
// MODULE : Lead bulk import
// ROUTE  : /api/leads/import
//
// METHODS
// POST   - Bulk-import leads from a parsed spreadsheet. `dryRun` validates and reports
//          the new/existing split without writing; a real run finds-or-creates the
//          linked contact and creates (or, in update mode, updates) the lead.
//
// ACCESS
// POST   - Authenticated. Same permission as creating a lead (any authenticated member
//          of the tenant). Every read/write is scoped to session.user.tenantId, so an
//          import can only touch the caller's workspace.
// ============================================================================
//
// The lead counterpart to /api/contacts/import — it follows the same shape (mode,
// dryRun, batched transactions, summary) but cannot reuse that endpoint, because a lead
// also resolves a Stage and an Assignee and links a Contact. Stages are validated against
// the tenant's configuration and never auto-created; unknown assignees are reported.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import { scoreLabelFor } from "@/lib/utils";
import { ensurePipelineStages } from "@/lib/pipelineStages";
import { IMPORT_MAX_ROWS, isValidEmail, isValidPhone, normalizePhone, type ImportResult } from "@/lib/import";

const BATCH_SIZE = 100;

const leadRowSchema = z.object({
  title: z.string().optional(),
  phone: z.string(),
  email: z.string().optional(),
  company: z.string().optional(),
  source: z.string().optional(),
  value: z.number().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  stageName: z.string().optional(),
  assignee: z.string().optional(),
});

const importSchema = z.object({
  leads: z
    .array(leadRowSchema)
    .min(1, "No leads to import")
    .max(IMPORT_MAX_ROWS, `Max ${IMPORT_MAX_ROWS} leads per import`),
  mode: z.enum(["skip", "update"]).default("skip"),
  dryRun: z.boolean().default(false),
});

type CleanLead = {
  phone: string;
  title: string;
  contactName: string;
  email?: string;
  company?: string;
  source?: string;
  value?: number;
  notes?: string;
  tags: string[];
  stageId: string;
  closesDeal: boolean;
  assignedToId: string | null;
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

  const { leads, mode, dryRun } = parsed.data;

  try {
    // Load the tenant's stages (provisioning defaults if needed) and members once.
    const [stages, users] = await Promise.all([
      ensurePipelineStages(tenantId),
      prisma.user.findMany({ where: { tenantId }, select: { id: true, name: true, email: true } }),
    ]);

    const enabledStages = stages.filter((s) => s.enabled);
    const stageByName = new Map(enabledStages.map((s) => [s.name.toLowerCase(), s]));
    const defaultStage =
      enabledStages.find((s) => s.isDefault) ?? enabledStages[0] ?? stages[0];
    if (!defaultStage) {
      return NextResponse.json({ success: false, error: "No pipeline stage is configured" }, { status: 409 });
    }

    // Resolve assignees by email (unique) or name (rejected if the name is ambiguous).
    const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));
    const userByName = new Map<string, string | "AMBIGUOUS">();
    for (const u of users) {
      const key = (u.name ?? "").toLowerCase();
      if (!key) continue;
      userByName.set(key, userByName.has(key) ? "AMBIGUOUS" : u.id);
    }

    // Server-side validation is the authority; invalid rows are counted, never written.
    const errors: ImportResult["errors"] = [];
    const byPhone = new Map<string, CleanLead>();
    let failed = 0;
    const fail = (ref: string, reason: string) => {
      failed++;
      if (errors.length < 50) errors.push({ ref, reason });
    };

    for (const row of leads) {
      const phone = normalizePhone(row.phone);
      const email = row.email?.trim() || undefined;

      if (!isValidPhone(phone)) {
        fail(row.phone, "Invalid phone number");
        continue;
      }
      if (email && !isValidEmail(email)) {
        fail(phone, "Invalid email address");
        continue;
      }

      let stage = defaultStage;
      if (row.stageName?.trim()) {
        const found = stageByName.get(row.stageName.trim().toLowerCase());
        if (!found) {
          fail(phone, `Unknown stage "${row.stageName}"`);
          continue;
        }
        stage = found;
      }

      let assignedToId: string | null = null;
      if (row.assignee?.trim()) {
        const key = row.assignee.trim().toLowerCase();
        const byEmail = userByEmail.get(key);
        const byName = userByName.get(key);
        if (byEmail) assignedToId = byEmail;
        else if (byName && byName !== "AMBIGUOUS") assignedToId = byName;
        else {
          fail(phone, byName === "AMBIGUOUS" ? `Ambiguous user "${row.assignee}"` : `Unknown user "${row.assignee}"`);
          continue;
        }
      }

      const title = row.title?.trim() || "";
      byPhone.set(phone, {
        phone,
        title: title || "Untitled lead",
        contactName: title || row.company?.trim() || phone,
        email,
        company: row.company?.trim() || undefined,
        source: row.source?.trim() || undefined,
        value: typeof row.value === "number" && row.value >= 0 ? row.value : undefined,
        notes: row.notes?.trim() || undefined,
        tags: (row.tags ?? []).map((t) => t.trim()).filter(Boolean),
        stageId: stage.id,
        closesDeal: stage.outcome !== "OPEN",
        assignedToId,
      });
    }

    const clean = [...byPhone.values()];
    const phones = clean.map((c) => c.phone);

    // Existing = a contact with this phone that already has at least one lead (tenant-scoped).
    const contacts = phones.length
      ? await prisma.contact.findMany({
          where: { tenantId, phone: { in: phones } },
          select: { id: true, phone: true, leads: { select: { id: true }, orderBy: { createdAt: "desc" }, take: 1 } },
        })
      : [];
    const contactByPhone = new Map(contacts.map((c) => [c.phone, { id: c.id, leadId: c.leads[0]?.id ?? null }]));
    const existingCount = clean.filter((c) => contactByPhone.get(c.phone)?.leadId).length;
    const newCount = clean.length - existingCount;

    if (dryRun) {
      const result: ImportResult = {
        total: leads.length,
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

    // Pre-resolve tag names to ids once (created on demand, business-scoped).
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
            // Find or create the linked contact (phone-keyed, like the contacts importer).
            const contact = await tx.contact.upsert({
              where: { phone_businessId: { phone: c.phone, businessId } },
              create: {
                tenantId,
                businessId,
                phone: c.phone,
                name: c.contactName,
                email: c.email,
                company: c.company,
                source: c.source ?? "IMPORT",
              },
              update: {
                ...(c.email && { email: c.email }),
                ...(c.company && { company: c.company }),
                ...(c.source && { source: c.source }),
              },
              select: { id: true },
            });

            const existingLeadId = contactByPhone.get(c.phone)?.leadId ?? null;

            if (existingLeadId && mode === "skip") {
              skipped++;
            } else if (existingLeadId && mode === "update") {
              await tx.lead.update({
                where: { id: existingLeadId },
                data: {
                  ...(c.title && { title: c.title }),
                  stageId: c.stageId,
                  assignedToId: c.assignedToId,
                  ...(c.value !== undefined && { value: c.value }),
                  ...(c.notes && { notes: c.notes }),
                  ...(c.closesDeal ? { closedAt: new Date() } : { closedAt: null }),
                },
              });
              updated++;
            } else {
              await tx.lead.create({
                data: {
                  tenantId,
                  businessId,
                  contactId: contact.id,
                  title: c.title,
                  stageId: c.stageId,
                  assignedToId: c.assignedToId,
                  score: 0,
                  scoreLabel: scoreLabelFor(0),
                  currency: "INR",
                  ...(c.value !== undefined && { value: c.value }),
                  ...(c.notes && { notes: c.notes }),
                  ...(c.closesDeal && { closedAt: new Date() }),
                },
              });
              created++;
            }

            // Tags live on the contact — link idempotently.
            for (const tagName of c.tags) {
              const tagId = tagIdByName.get(tagName);
              if (!tagId) continue;
              await tx.contactTag.upsert({
                where: { contactId_tagId: { contactId: contact.id, tagId } },
                create: { contactId: contact.id, tagId },
                update: {},
              });
            }
          }
        },
        { timeout: 30_000 },
      );
    }

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: "LEADS_IMPORTED",
        resource: "lead",
        metadata: { created, updated, skipped, failed, mode, total: leads.length },
      },
    });

    const result: ImportResult = { total: leads.length, created, updated, skipped, failed, errors };
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("[LEADS IMPORT]", error.code, error.message);
    } else {
      console.error("[LEADS IMPORT]", error);
    }
    return NextResponse.json({ success: false, error: "Import failed" }, { status: 500 });
  }
}
