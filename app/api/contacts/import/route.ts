import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Expects JSON body: { contacts: { name, phone, email?, company?, designation?, location?, source? }[] }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const { contacts } = body as { contacts: Record<string, string>[] };
    if (!Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json({ success: false, error: "contacts array is required" }, { status: 400 });
    }
    if (contacts.length > 5000) {
      return NextResponse.json({ success: false, error: "Max 5000 contacts per import" }, { status: 400 });
    }

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of contacts) {
      const phone = (row.phone ?? "").toString().replace(/\D/g, "");
      const name = (row.name ?? "").trim();

      if (!phone || !name) {
        skipped++;
        continue;
      }

      try {
        await prisma.contact.upsert({
          where: { phone_tenantId: { phone, tenantId } },
          create: {
            tenantId,
            phone,
            name,
            email: row.email || undefined,
            company: row.company || undefined,
            designation: row.designation || undefined,
            location: row.location || undefined,
            source: row.source || "CSV_IMPORT",
          },
          update: {
            name,
            ...(row.email && { email: row.email }),
            ...(row.company && { company: row.company }),
            ...(row.designation && { designation: row.designation }),
            ...(row.location && { location: row.location }),
          },
        });
        created++;
      } catch (e) {
        skipped++;
        if (errors.length < 5) errors.push(`Row with phone ${phone}: ${String(e)}`);
      }
    }

    return NextResponse.json({ success: true, data: { created, skipped, errors } });
  } catch (error) {
    console.error("[CONTACTS IMPORT]", error);
    return NextResponse.json({ success: false, error: "Import failed" }, { status: 500 });
  }
}
