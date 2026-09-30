import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import { createContactSchema } from "@/lib/validators/contact";
import { requirePermission } from "@/lib/permissions";

/** Keep only tag ids that belong to this business — never link another workspace's tags. */
async function ownedTagIds(businessId: string, tagIds: string[] | undefined) {
  if (!tagIds?.length) return [];
  const tags = await prisma.tag.findMany({ where: { businessId, id: { in: tagIds } }, select: { id: true } });
  return tags.map((t) => t.id);
}

function normalizeSource(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "20"));
  const search = searchParams.get("search") ?? "";
  // Phones are stored digits-only, so "+91 98765" must search as "9198765".
  const searchDigits = search.replace(/\D/g, "");
  const tagId = searchParams.get("tagId") ?? "";
  const source = searchParams.get("source") ?? "";

  const where = {
    tenantId: scope.tenantId,
    // Contacts are created under the active business (see the `phone_businessId` unique key),
    // so the list must be filtered by it too — otherwise every business in the tenant shows
    // every other business's contacts and switching accounts changes nothing.
    businessId: scope.businessId,
    isBlocked: false,
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { phone: { contains: searchDigits || search } },
        { email: { contains: search, mode: "insensitive" as const } },
        { company: { contains: search, mode: "insensitive" as const } },
      ],
    }),
    ...(tagId && { tags: { some: { tagId } } }),
    ...(source && { source: { equals: source, mode: "insensitive" as const } }),
  };

  const [total, contacts] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      include: {
        tags: { include: { tag: true } },
        _count: { select: { conversations: true, leads: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: contacts,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function POST(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermission(scope, "contacts.manage");
  if (denied) return denied;

  const { tenantId, businessId, userId } = scope;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createContactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  }

  try {
    const { tags: rawTags, ...data } = parsed.data;
    const source = normalizeSource(data.source);
    const tags = await ownedTagIds(businessId, rawTags);

    // `phone` is already normalised by the schema, so "+91 98765 43210" and "9876543210" hit
    // the same (phone, businessId) key here and in the database's unique index.
    const existing = await prisma.contact.findUnique({
      where: { phone_businessId: { phone: data.phone, businessId } },
      select: { id: true, isBlocked: true, name: true },
    });
    if (existing && !existing.isBlocked) {
      return NextResponse.json(
        { success: false, error: `This number is already saved as "${existing.name}"` },
        { status: 409 }
      );
    }

    const include = {
      tags: { include: { tag: true } },
      _count: { select: { conversations: true, leads: true } },
    };

    // A deleted contact is only hidden (isBlocked), so its number still holds the unique key.
    // Re-adding that number restores the contact with the new details instead of failing with
    // a duplicate the user cannot see.
    const contact = existing
      ? await prisma.$transaction(async (tx) => {
          await tx.contactTag.deleteMany({ where: { contactId: existing.id } });
          return tx.contact.update({
            where: { id: existing.id },
            data: {
              ...data,
              source,
              isBlocked: false,
              ...(tags.length > 0 && { tags: { create: tags.map((tagId) => ({ tagId })) } }),
            },
            include,
          });
        })
      : await prisma.contact.create({
          data: {
            ...data,
            source,
            tenantId,
            businessId,
            ...(tags.length > 0 && { tags: { create: tags.map((tagId) => ({ tagId })) } }),
          },
          include,
        });

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: existing ? "CONTACT_RESTORED" : "CONTACT_CREATED",
        resource: "contact",
        resourceId: contact.id,
      },
    });

    return NextResponse.json({ success: true, data: contact }, { status: 201 });
  } catch (error) {
    // Two requests adding the same number at once: the unique index catches the second.
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { success: false, error: "A contact with this phone number already exists" },
        { status: 409 }
      );
    }
    console.error("[CONTACTS POST]", error);
    return NextResponse.json({ success: false, error: "Failed to create contact" }, { status: 500 });
  }
}

