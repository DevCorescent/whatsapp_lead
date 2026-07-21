// ============================================================================
// MODULE : Bulk contact import
// ROUTE  : POST /api/contacts/import
//
// Accepts an array of parsed CSV rows and creates contacts for the current
// tenant, de-duplicating by phone (against existing contacts AND within the
// batch) and returning a per-row report. The client parses and previews the CSV
// first; this endpoint is the authoritative validate-and-write step.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveTenantPlan } from "@/lib/billing/usage";
import { isUnlimited } from "@/lib/billing/tiers";

const MAX_ROWS = 5000;
const PHONE_REGEX = /^\+?[1-9]\d{9,14}$/;

const rowSchema = z.object({
  name: z.string().optional(),
  phone: z.string(),
  email: z.string().optional(),
  company: z.string().optional(),
  tags: z.string().optional(),
});

const importSchema = z.object({
  rows: z.array(rowSchema).min(1, "No rows to import").max(MAX_ROWS, `At most ${MAX_ROWS} rows per import`),
});

/** Strip spaces, dashes and brackets so "+91 98765-43210" validates like "+919876543210". */
function normalizePhone(raw: string): string {
  return raw.replace(/[\s()\-.]/g, "");
}

/** Split a tags cell on comma or semicolon into a clean, de-duplicated list. */
function parseTags(raw?: string): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(/[;,]/).map((t) => t.trim()).filter(Boolean))].slice(0, 20);
}

interface RowError {
  row: number;
  phone: string;
  reason: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId } = session.user;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  try {
    // Load existing phones and emails once so duplicate detection is a set lookup,
    // not a query per row. Emails are keyed lowercase since they are case-insensitive.
    const existing = await prisma.contact.findMany({
      where: { tenantId },
      select: { phone: true, email: true },
    });
    const seenPhones = new Set(existing.map((c) => c.phone));
    const seenEmails = new Set(
      existing.map((c) => c.email?.trim().toLowerCase()).filter((e): e is string => Boolean(e)),
    );

    // Billing: cap how many new contacts this import may create by the plan limit.
    const { limits } = await resolveTenantPlan(tenantId);
    const remainingCapacity = isUnlimited(limits.contacts)
      ? Infinity
      : Math.max(0, limits.contacts - existing.length);

    let created = 0;
    let duplicates = 0;
    const failed: RowError[] = [];

    // Sequential rather than Promise.all: two rows with the same new phone must
    // not both pass the in-batch dedup check by racing, and the volume here is
    // an import job, not a latency-sensitive request.
    for (let i = 0; i < parsed.data.rows.length; i++) {
      const raw = parsed.data.rows[i];
      const rowNum = i + 1;
      const phone = normalizePhone(raw.phone ?? "");

      if (!phone) {
        failed.push({ row: rowNum, phone: raw.phone ?? "", reason: "Missing phone" });
        continue;
      }
      if (!PHONE_REGEX.test(phone)) {
        failed.push({ row: rowNum, phone, reason: "Invalid phone format" });
        continue;
      }
      const email = raw.email?.trim();
      if (email && !z.string().email().safeParse(email).success) {
        failed.push({ row: rowNum, phone, reason: "Invalid email" });
        continue;
      }
      const emailKey = email?.toLowerCase();

      // Skip rows whose phone OR email already exists (in the tenant or earlier in
      // this same file) — either collision means we would create a duplicate contact.
      if (seenPhones.has(phone)) {
        duplicates++;
        continue;
      }
      if (emailKey && seenEmails.has(emailKey)) {
        duplicates++;
        continue;
      }
      // Stop creating once the plan's contact limit is reached; the rest are
      // reported as failed rather than silently dropped.
      if (created >= remainingCapacity) {
        failed.push({ row: rowNum, phone, reason: "Plan contact limit reached — upgrade to import more" });
        continue;
      }

      seenPhones.add(phone);
      if (emailKey) seenEmails.add(emailKey);

      const tags = parseTags(raw.tags);
      try {
        await prisma.contact.create({
          data: {
            tenantId,
            phone,
            name: raw.name?.trim() || phone,
            ...(email ? { email } : {}),
            ...(raw.company?.trim() ? { company: raw.company.trim() } : {}),
            source: "CSV Import",
            ...(tags.length
              ? {
                  tags: {
                    create: tags.map((name) => ({
                      tag: {
                        connectOrCreate: {
                          where: { name_tenantId: { name, tenantId } },
                          create: { name, tenantId },
                        },
                      },
                    })),
                  },
                }
              : {}),
          },
        });
        created++;
      } catch (error) {
        // A concurrent insert of the same phone surfaces as P2002 — count it as a
        // duplicate rather than a hard failure.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          duplicates++;
        } else {
          console.error(`[CONTACT IMPORT] Row ${rowNum} failed:`, error);
          failed.push({ row: rowNum, phone, reason: "Could not be saved" });
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: { total: parsed.data.rows.length, created, duplicates, failed },
    });
  } catch (error) {
    console.error("[CONTACT IMPORT]", error);
    return NextResponse.json({ success: false, error: "Import failed" }, { status: 500 });
  }
}
