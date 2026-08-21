// ============================================================================
// MODULE : CSV Export
// ROUTE  : GET /api/export?resource=contacts|leads|campaigns|analytics
//
// Streams data back as a downloadable CSV, scoped to the tenant AND the active
// business — an export must never cross a workspace boundary, and in a tenant
// running several WhatsApp numbers it must not cross a business one either.
//
// This is the only export route. Contacts and leads previously had bespoke ones
// that were tenant-scoped, so a four-business workspace downloaded all four
// businesses' records from a page showing one; the leads route also skipped the
// allowExport gate entirely. Both were deleted rather than repaired, because two
// implementations of the same CSV is how that divergence happened.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { guardFeature } from "@/lib/billing/guard";
import { getBusinessScope } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import { toCsv, type CsvColumn } from "@/lib/csv";

const RESOURCES = ["contacts", "leads", "campaigns", "analytics", "faq-interest", "ivr-responses"] as const;
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

  const denied = await guardFeature(tenantId, "allowExport");
  if (denied) return denied;

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
          contact: { select: { name: true, phone: true, email: true, company: true } },
          assignedTo: { select: { name: true } },
          stage: { select: { name: true, outcome: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      // The qualification fields are the reason anyone exports leads at all —
      // budget, authority, requirement and timeline are what a sales team sorts
      // and filters on, and until now they could not leave the app.
      const columns: CsvColumn<(typeof rows)[number]>[] = [
        { header: "Title", value: (r) => r.title },
        { header: "Stage", value: (r) => r.stage?.name ?? "" },
        { header: "Outcome", value: (r) => r.stage?.outcome ?? "" },
        { header: "Score", value: (r) => r.score },
        { header: "Score Label", value: (r) => r.scoreLabel },
        { header: "Value", value: (r) => r.value },
        { header: "Currency", value: (r) => r.currency },
        { header: "Contact", value: (r) => r.contact?.name ?? "" },
        { header: "Contact Phone", value: (r) => r.contact?.phone ?? "" },
        { header: "Contact Email", value: (r) => r.contact?.email ?? "" },
        { header: "Company", value: (r) => r.contact?.company ?? "" },
        { header: "Budget", value: (r) => r.budget },
        { header: "Authority", value: (r) => r.authority },
        { header: "Requirement", value: (r) => r.requirement },
        { header: "Timeline", value: (r) => r.timeline },
        { header: "Company Size", value: (r) => r.companySize },
        { header: "Decision Maker", value: (r) => (r.isDecisionMaker ? "Yes" : "No") },
        { header: "Assigned To", value: (r) => r.assignedTo?.name ?? "" },
        { header: "Notes", value: (r) => r.notes },
        { header: "Lost Reason", value: (r) => r.lostReason },
        { header: "Created", value: (r) => r.createdAt.toISOString() },
        { header: "Closed", value: (r) => r.closedAt?.toISOString() ?? "" },
      ];
      return csvResponse(toCsv(rows, columns), resource);
    }

    // Every FAQ a customer tapped, newest first. The most direct intent data the
    // product holds: the contact chose the question, from a list, in their own
    // conversation — so each row is a named person and a commercial question,
    // which is exactly what a sales team wants to work from.
    if (resource === "faq-interest") {
      const rows = await prisma.faqInteraction.findMany({
        where: { tenantId, businessId },
        include: {
          contact: {
            select: { name: true, phone: true, email: true, company: true, optedOut: true },
          },
        },
        orderBy: { createdAt: "desc" },
        // Bounded so one export cannot pull a year of taps into memory. Newest
        // first, so the cut falls on the least useful end.
        take: 10_000,
      });

      const columns: CsvColumn<(typeof rows)[number]>[] = [
        { header: "Asked At", value: (r) => r.createdAt.toISOString() },
        { header: "Question", value: (r) => r.question },
        { header: "Contact", value: (r) => r.contact?.name ?? "" },
        { header: "Phone", value: (r) => r.contact?.phone ?? "" },
        { header: "Email", value: (r) => r.contact?.email ?? "" },
        { header: "Company", value: (r) => r.contact?.company ?? "" },
        { header: "Opted Out", value: (r) => (r.contact?.optedOut ? "Yes" : "No") },
        { header: "Source", value: (r) => r.sourceKind },
        { header: "Conversation", value: (r) => r.conversationId ?? "" },
      ];
      return csvResponse(toCsv(rows, columns), resource);
    }

    // What customers answered in a chatbot flow — the IVR equivalent of
    // faq-interest, and the only place the flow's captured variables survive:
    // Conversation.flowVars is nulled the moment a flow ends.
    if (resource === "ivr-responses") {
      const rows = await prisma.flowRun.findMany({
        where: { tenantId, businessId },
        include: {
          contact: { select: { name: true, phone: true, email: true, company: true } },
        },
        orderBy: { startedAt: "desc" },
        take: 10_000,
      });

      // A column per captured variable, rather than one blob. The variables ARE
      // the answers — "which plan", "what address" — and a sales team needs to
      // sort and filter on them, which a semicolon-joined string cannot do.
      const variableKeys = [
        ...new Set(
          rows.flatMap((r) =>
            r.variables && typeof r.variables === "object" && !Array.isArray(r.variables)
              ? Object.keys(r.variables as Record<string, unknown>)
              : [],
          ),
        ),
      ]
        // Bounded: a flow with a runaway set_variable loop must not produce a
        // thousand-column CSV that no spreadsheet will open.
        .slice(0, 25)
        .sort();

      const variableOf = (r: (typeof rows)[number], key: string) => {
        const vars = r.variables as Record<string, unknown> | null;
        const value = vars && typeof vars === "object" ? vars[key] : undefined;
        return typeof value === "string" ? value : "";
      };

      const pathOf = (r: (typeof rows)[number]) =>
        Array.isArray(r.path)
          ? (r.path as { chose?: unknown }[])
              .map((s) => (typeof s?.chose === "string" ? s.chose : ""))
              .filter(Boolean)
              .join(" → ")
          : "";

      // A run still IN_PROGRESS after a day is one the customer walked away
      // from. Derived here rather than stored, because nobody observes the
      // moment someone stops replying — see FlowRunStatus in the schema.
      const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;
      const statusOf = (r: (typeof rows)[number]) =>
        r.status === "IN_PROGRESS" && Date.now() - r.updatedAt.getTime() > ABANDONED_AFTER_MS
          ? "ABANDONED"
          : r.status;

      const columns: CsvColumn<(typeof rows)[number]>[] = [
        { header: "Started", value: (r) => r.startedAt.toISOString() },
        { header: "Flow", value: (r) => r.flowName },
        { header: "Status", value: (r) => statusOf(r) },
        { header: "Contact", value: (r) => r.contact?.name ?? "" },
        { header: "Phone", value: (r) => r.contact?.phone ?? "" },
        { header: "Email", value: (r) => r.contact?.email ?? "" },
        { header: "Company", value: (r) => r.contact?.company ?? "" },
        { header: "Path", value: (r) => pathOf(r) },
        { header: "Stopped at", value: (r) => r.lastNodeLabel ?? "" },
        ...variableKeys.map((key) => ({
          header: key,
          value: (r: (typeof rows)[number]) => variableOf(r, key),
        })),
        { header: "Ended", value: (r) => r.endedAt?.toISOString() ?? "" },
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
      prisma.lead.count({ where: { tenantId, businessId, stage: { outcome: "WON" } } }),
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
