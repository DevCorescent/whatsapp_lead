import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import { updateContactSchema } from "@/lib/validators/contact";
import { findBlacklisted } from "@/lib/blacklist";
import { requirePermission } from "@/lib/permissions";

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
      leads: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { stage: { select: { id: true, name: true, color: true } } },
      },
      _count: { select: { conversations: true } },
    },
  });

  if (!contact) return NextResponse.json({ success: false, error: "Contact not found" }, { status: 404 });

  // Shown on the contact page, so a user can see why messages to this number are refused.
  const blacklisted = (await findBlacklisted(session.user.tenantId, [contact.phone])).get(contact.phone) ?? null;

  return NextResponse.json({ success: true, data: { ...contact, blacklisted } });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Contacts are created and listed under one business (the `phone_businessId`
  // unique key), so an edit is scoped the same way. Tenant-only scoping let a
  // user of one business rewrite another business's contact by id.
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermission(scope, "contacts.manage");
  if (denied) return denied;

  const contact = await prisma.contact.findFirst({
    where: { id, tenantId: session.user.tenantId, businessId: scope.businessId },
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

  const { tags: rawTags, ...data } = parsed.data;
  // Only this business's tags — a caller-supplied id must not link another workspace's tag.
  const tags = rawTags === undefined
    ? undefined
    : (await prisma.tag.findMany({ where: { businessId: scope.businessId, id: { in: rawTags } }, select: { id: true } })).map((t) => t.id);

  // Changing the number to one another contact already has would create a duplicate.
  if (data.phone && data.phone !== contact.phone) {
    const clash = await prisma.contact.findUnique({
      where: { phone_businessId: { phone: data.phone, businessId: scope.businessId } },
      select: { id: true, name: true, isBlocked: true },
    });
    if (clash && clash.id !== id) {
      return NextResponse.json(
        {
          success: false,
          error: clash.isBlocked
            ? "This number belongs to a deleted contact — re-add it from Contacts to restore it"
            : `This number is already saved as "${clash.name}"`,
        },
        { status: 409 },
      );
    }
  }

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

  // Business-scoped like PATCH: tenant-only scoping let a user of one business delete another
  // business's contact by id.
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermission(scope, "contacts.manage");
  if (denied) return denied;

  const contact = await prisma.contact.findFirst({
    where: { id, tenantId: session.user.tenantId, businessId: scope.businessId },
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
