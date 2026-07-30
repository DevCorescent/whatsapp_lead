import { NextRequest, NextResponse } from "next/server";
import { getBusinessScope } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import { updateContactSchema } from "@/lib/validators/contact";

type Params = { params: Promise<{ id: string }> };

function normalizeSource(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(req: NextRequest, { params }: Params) {
  // Scoped to the active business, like the contact *list* already is: a contact belongs to one
  // workspace (the schema keys it `@@unique([phone, businessId])`), so resolving one by id alone
  // would open another workspace's contact from a guessed or stale link.
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id, tenantId: scope.tenantId, businessId: scope.businessId },
    include: {
      tags: { include: { tag: true } },
      leads: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { stage: { select: { id: true, name: true, color: true } } },
      },
      // The detail page has a Conversations tab that renders these; only the `_count` was
      // included, so the tab claimed the contact had no conversations however many it had.
      conversations: {
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: {
          id: true,
          status: true,
          unreadCount: true,
          lastMessagePreview: true,
          lastMessageAt: true,
          updatedAt: true,
        },
      },
      _count: { select: { conversations: true } },
    },
  });

  if (!contact) return NextResponse.json({ success: false, error: "Contact not found" }, { status: 404 });

  return NextResponse.json({ success: true, data: contact });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  // Same scope as the GET above. A contact that this workspace cannot read is not one it may
  // edit either, and resolving the two differently is how an id from another workspace becomes
  // writable through a link that will not even render.
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id, tenantId: scope.tenantId, businessId: scope.businessId },
  });
  if (!contact) return NextResponse.json({ success: false, error: "Contact not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateContactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { tags, ...data } = parsed.data;
  const sanitizedData = {
    ...data,
    ...(data.source !== undefined ? { source: normalizeSource(data.source) } : {}),
  };

  const updated = await prisma.$transaction(async (tx) => {
    if (tags !== undefined) {
      await tx.contactTag.deleteMany({ where: { contactId: id } });
      if (tags.length > 0) {
        await tx.contactTag.createMany({
          data: tags.map((tagId) => ({ contactId: id, tagId })),
        });
      }
    }

    return tx.contact.update({
      where: { id },
      data: sanitizedData,
      include: { tags: { include: { tag: true } } },
    });
  });

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id, tenantId: scope.tenantId, businessId: scope.businessId },
  });
  if (!contact) return NextResponse.json({ success: false, error: "Contact not found" }, { status: 404 });

  // Soft delete — marks as blocked so it disappears from lists but data is preserved
  await prisma.contact.update({ where: { id }, data: { isBlocked: true } });

  await prisma.auditLog.create({
    data: {
      tenantId: scope.tenantId,
      userId: scope.userId,
      action: "CONTACT_DELETED",
      resource: "contact",
      resourceId: id,
    },
  });

  return NextResponse.json({ success: true });
}
