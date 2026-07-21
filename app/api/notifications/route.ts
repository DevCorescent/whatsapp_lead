import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ACTION_LABEL: Record<string, string> = {
  CONTACT_DELETED: "Contact deleted",
  LEAD_CREATED: "New lead created",
  CAMPAIGN_SENT: "Campaign sent",
  TICKET_CREATED: "New ticket opened",
  TICKET_RESOLVED: "Ticket resolved",
  AI_QUALIFICATION: "Lead AI-qualified",
  USER_INVITED: "Team member invited",
};

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    const [logs, newMessages] = await Promise.all([
      prisma.auditLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 15,
        select: {
          id: true, action: true, resource: true, resourceId: true,
          createdAt: true,
          user: { select: { name: true, avatar: true } },
        },
      }),
      prisma.message.findMany({
        where: { tenantId, direction: "INBOUND" },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true, content: true, createdAt: true,
          conversation: {
            select: { contact: { select: { name: true, avatarUrl: true } } },
          },
        },
      }),
    ]);

    const notifications = [
      ...newMessages.map((m) => ({
        id: `msg-${m.id}`,
        type: "message" as const,
        title: `New message from ${m.conversation.contact.name}`,
        body: m.content?.slice(0, 80) ?? "Media message",
        avatar: m.conversation.contact.avatarUrl ?? null,
        createdAt: m.createdAt,
        href: "/inbox",
      })),
      ...logs.map((l) => ({
        id: `log-${l.id}`,
        type: "activity" as const,
        title: ACTION_LABEL[l.action] ?? l.action.replace(/_/g, " ").toLowerCase(),
        body: `${l.resource} ${l.resourceId ? `#${l.resourceId.slice(-6)}` : ""}`,
        avatar: l.user?.avatar ?? null,
        createdAt: l.createdAt,
        href: `/${l.resource}s`,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20);

    return NextResponse.json({ success: true, data: notifications });
  } catch (error) {
    console.error("[NOTIFICATIONS]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch notifications" }, { status: 500 });
  }
}
