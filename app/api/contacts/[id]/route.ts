import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateContactSchema } from "@/lib/validators/contact";

type Params = { params: Promise<{ id: string }> };

function normalizeSource(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id, tenantId: session.user.tenantId },
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
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id, tenantId: session.user.tenantId },
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
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  if (!contact) return NextResponse.json({ success: false, error: "Contact not found" }, { status: 404 });

  // Soft delete — marks as blocked so it disappears from lists but data is preserved
  await prisma.contact.update({ where: { id }, data: { isBlocked: true } });

  await prisma.auditLog.create({
    data: {
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "CONTACT_DELETED",
      resource: "contact",
      resourceId: id,
    },
  });

  return NextResponse.json({ success: true });
}
