import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import { createContactSchema } from "@/lib/validators/contact";

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
  const tagId = searchParams.get("tagId") ?? "";
  const source = searchParams.get("source") ?? "";

  const where = {
    tenantId: scope.tenantId,
    isBlocked: false,
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { phone: { contains: search } },
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
    const { tags, ...data } = parsed.data;
    const source = normalizeSource(data.source);

    const existing = await prisma.contact.findUnique({
      where: { phone_businessId: { phone: data.phone, businessId } },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "A contact with this phone number already exists" },
        { status: 409 }
      );
    }

    const contact = await prisma.contact.create({
      data: {
        ...data,
        source,
        tenantId,
        businessId,
        ...(tags && tags.length > 0 && {
          tags: { create: tags.map((tagId) => ({ tagId })) },
        }),
      },
      include: {
        tags: { include: { tag: true } },
        _count: { select: { conversations: true, leads: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: "CONTACT_CREATED",
        resource: "contact",
        resourceId: contact.id,
      },
    });

    return NextResponse.json({ success: true, data: contact }, { status: 201 });
  } catch (error) {
    console.error("[CONTACTS POST]", error);
    return NextResponse.json({ success: false, error: "Failed to create contact" }, { status: 500 });
  }
}

