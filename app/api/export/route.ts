// ============================================================================
// MODULE : CSV Export
// ROUTE  : GET /api/export?resource=contacts|leads|campaigns|analytics
//
// Streams a tenant's data back as a downloadable CSV. Every query is scoped to
// session.user.tenantId — an export must never cross a workspace boundary.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getBusinessScope } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import { toCsv, type CsvColumn } from "@/lib/csv";

const RESOURCES = ["contacts", "leads", "campaigns", "analytics"] as const;
type Resource = (typeof RESOURCES)[number];

/** Package a CSV string as a browser download with a dated filename. */
function csvResponse(csv: string, resource: string): NextResponse {
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${resource}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId, businessId } = scope;

  const resource = new URL(req.url).searchParams.get("resource") as Resource | null;
  if (!resource || !RESOURCES.includes(resource)) {
    return NextResponse.json(
      { success: false, error: `resource must be one of: ${RESOURCES.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    if (resource === "contacts") {
      const rows = await prisma.contact.findMany({
        where: { tenantId, businessId },
        include: { tags: { include: { tag: { select: { name: true } } } } },
        orderBy: { createdAt: "desc" },
      });
      const columns: CsvColumn<(typeof rows)[number]>[] = [
        { header: "Name", value: (r) => r.name },
        { header: "Phone", value: (r) => r.phone },
        { header: "Email", value: (r) => r.email },
        { header: "Company", value: (r) => r.company },
        { header: "Designation", value: (r) => r.designation },
        { header: "Location", value: (r) => r.location },
        { header: "Source", value: (r) => r.source },
        { header: "Tags", value: (r) => r.tags.map((t) => t.tag.name).join("; ") },
        { header: "Created", value: (r) => r.createdAt.toISOString() },
      ];
      return csvResponse(toCsv(rows, columns), resource);
    }

    if (resource === "leads") {
      const rows = await prisma.lead.findMany({
        where: { tenantId, businessId },
        include: {
          contact: { select: { name: true, phone: true } },
          assignedTo: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      const columns: CsvColumn<(typeof rows)[number]>[] = [
        { header: "Title", value: (r) => r.title },
        { header: "Stage", value: (r) => r.stage },
        { header: "Score", value: (r) => r.score },
        { header: "Score Label", value: (r) => r.scoreLabel },
        { header: "Value", value: (r) => r.value },
        { header: "Currency", value: (r) => r.currency },
        { header: "Contact", value: (r) => r.contact?.name ?? "" },
        { header: "Contact Phone", value: (r) => r.contact?.phone ?? "" },
        { header: "Assigned To", value: (r) => r.assignedTo?.name ?? "" },
        { header: "Created", value: (r) => r.createdAt.toISOString() },
      ];
      return csvResponse(toCsv(rows, columns), resource);
    }

    if (resource === "campaigns") {
      const rows = await prisma.campaign.findMany({
        where: { tenantId, businessId },
        orderBy: { createdAt: "desc" },
      });
      const columns: CsvColumn<(typeof rows)[number]>[] = [
        { header: "Name", value: (r) => r.name },
        { header: "Status", value: (r) => r.status },
        { header: "Total", value: (r) => r.totalCount },
        { header: "Sent", value: (r) => r.sentCount },
        { header: "Delivered", value: (r) => r.deliveredCount },
        { header: "Read", value: (r) => r.readCount },
        { header: "Replied", value: (r) => r.repliedCount },
        { header: "Failed", value: (r) => r.failedCount },
        { header: "Scheduled At", value: (r) => r.scheduledAt?.toISOString() ?? "" },
        { header: "Created", value: (r) => r.createdAt.toISOString() },
      ];
      return csvResponse(toCsv(rows, columns), resource);
    }

    // analytics — a compact KPI summary as (metric, value) rows.
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
      totalContacts,
      totalLeads,
      wonLeads,
      totalConversations,
      openConversations,
      messagesThisMonth,
      totalCampaigns,
    ] = await Promise.all([
      prisma.contact.count({ where: { tenantId, businessId } }),
      prisma.lead.count({ where: { tenantId, businessId } }),
      prisma.lead.count({ where: { tenantId, businessId, stage: "WON" } }),
      prisma.conversation.count({ where: { tenantId, businessId } }),
      prisma.conversation.count({ where: { tenantId, businessId, status: "OPEN" } }),
      prisma.message.count({ where: { tenantId, businessId, createdAt: { gte: startOfMonth } } }),
      prisma.campaign.count({ where: { tenantId, businessId } }),
    ]);

    const conversionRate = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0;
    const summary = [
      { metric: "Total Contacts", value: totalContacts },
      { metric: "Total Leads", value: totalLeads },
      { metric: "Won Deals", value: wonLeads },
      { metric: "Conversion Rate (%)", value: conversionRate },
      { metric: "Total Conversations", value: totalConversations },
      { metric: "Open Conversations", value: openConversations },
      { metric: "Messages This Month", value: messagesThisMonth },
      { metric: "Total Campaigns", value: totalCampaigns },
    ];
    const columns: CsvColumn<(typeof summary)[number]>[] = [
      { header: "Metric", value: (r) => r.metric },
      { header: "Value", value: (r) => r.value },
    ];
    return csvResponse(toCsv(summary, columns), resource);
  } catch (error) {
    console.error("[EXPORT]", error);
    return NextResponse.json({ success: false, error: "Export failed" }, { status: 500 });
  }
}
