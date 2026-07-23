import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  const leads = await prisma.lead.findMany({
    where: { tenantId },
    select: {
      title: true, score: true, scoreLabel: true,
      value: true, currency: true, notes: true,
      createdAt: true, closedAt: true,
      stage: { select: { name: true } },
      contact: { select: { name: true, phone: true, email: true, company: true } },
      assignedTo: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = leads.map((l) => ({
    title: l.title,
    stage: l.stage.name,
    score: l.score,
    score_label: l.scoreLabel,
    value: l.value ?? "",
    currency: l.currency,
    contact_name: l.contact.name,
    contact_phone: l.contact.phone,
    contact_email: l.contact.email ?? "",
    contact_company: l.contact.company ?? "",
    assigned_to: l.assignedTo?.name ?? "",
    notes: l.notes ?? "",
    created_at: l.createdAt.toISOString(),
    closed_at: l.closedAt?.toISOString() ?? "",
  }));

  const cols = Object.keys(rows[0] ?? {});
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(","), ...rows.map((r) => cols.map((c) => escape((r as Record<string, unknown>)[c])).join(","))];

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
