import { NextRequest, NextResponse } from "next/server";
import { getBusinessScope } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import { updateContactSchema } from "@/lib/validators/contact";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId } = scope;

  const { id } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id, tenantId, businessId },
    include: {
      tags: { include: { tag: true } },
      leads: { orderBy: { createdAt: "desc" }, take: 5 },
      _count: { select: { conversations: true } },
    },
  });

  if (!contact) return NextResponse.json({ success: false, error: "Contact not found" }, { status: 404 });

  return NextResponse.json({ success: true, data: contact });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId } = scope;

  const { id } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id, tenantId, businessId },
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
      data,
      include: { tags: { include: { tag: true } } },
    });
  });

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId, userId } = scope;

  const { id } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id, tenantId, businessId },
  });
  if (!contact) return NextResponse.json({ success: false, error: "Contact not found" }, { status: 404 });

  // Soft delete — marks as blocked so it disappears from lists but data is preserved
  await prisma.contact.update({ where: { id }, data: { isBlocked: true } });

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action: "CONTACT_DELETED",
      resource: "contact",
      resourceId: id,
    },
  });

  return NextResponse.json({ success: true });
}
