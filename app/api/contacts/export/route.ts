import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  const contacts = await prisma.contact.findMany({
    where: { tenantId, isBlocked: false },
    select: {
      name: true, phone: true, email: true, company: true,
      designation: true, location: true, source: true,
      optedOut: true, createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = contacts.map((c) => ({
    name: c.name,
    phone: c.phone,
    email: c.email ?? "",
    company: c.company ?? "",
    designation: c.designation ?? "",
    location: c.location ?? "",
    source: c.source ?? "",
    opted_out: c.optedOut ? "Yes" : "No",
    created_at: c.createdAt.toISOString(),
  }));

  const cols = Object.keys(rows[0] ?? {});
  const lines = [cols.join(","), ...rows.map((r) => cols.map((c) => {
    const v = String((r as Record<string, string>)[c] ?? "");
    return v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(","))];

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
