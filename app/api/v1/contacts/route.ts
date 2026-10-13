/**
 * GET  /api/v1/contacts        — list contacts (paginated)
 * POST /api/v1/contacts        — create a contact
 *
 * Auth: Authorization: Bearer <api_key>
 *
 * POST body:
 *   { "name": "Rahul Sharma", "phone": "+919876543210", "email": "...", "notes": "..." }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateV1, unauthorized } from "@/lib/v1auth";
import { z } from "zod";

const CreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().min(7, "Phone number is too short").max(15, "Phone number is too long")),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  notes: z.string().max(1000).optional(),
  source: z.string().max(80).optional(),
});

export async function GET(req: NextRequest) {
  const scope = await authenticateV1(req);
  if (!scope) return unauthorized();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20") || 20));
  const search = (searchParams.get("search") ?? "").trim();

  const where = {
    businessId: scope.businessId,
    isBlocked: false,
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { phone: { contains: search.replace(/\D/g, "") } },
      ],
    }),
  };

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, name: true, phone: true, email: true, notes: true, source: true, createdAt: true },
    }),
    prisma.contact.count({ where }),
  ]);

  return NextResponse.json({ success: true, data: contacts, pagination: { page, limit, total } });
}

export async function POST(req: NextRequest) {
  const scope = await authenticateV1(req);
  if (!scope) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 422 },
    );
  }

  const { tenantId, businessId } = scope;
  const { name, phone, email, notes, source } = parsed.data;

  const existing = await prisma.contact.findUnique({
    where: { phone_businessId: { phone, businessId } },
    select: { id: true, isBlocked: true, name: true },
  });

  if (existing && !existing.isBlocked) {
    return NextResponse.json(
      { success: false, error: `Number already exists as "${existing.name}"`, contactId: existing.id },
      { status: 409 },
    );
  }

  const contact = existing
    ? await prisma.contact.update({
        where: { id: existing.id },
        data: { name, email: email || null, notes, source: source || "api", isBlocked: false },
        select: { id: true, name: true, phone: true, email: true, createdAt: true },
      })
    : await prisma.contact.create({
        data: { tenantId, businessId, name, phone, email: email || null, notes, source: source || "api" },
        select: { id: true, name: true, phone: true, email: true, createdAt: true },
      });

  return NextResponse.json({ success: true, contact }, { status: existing ? 200 : 201 });
}
