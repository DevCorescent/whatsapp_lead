// TODO [SHALMON]: Implement GET (list with pagination/search) and POST (create contact).
//
// GET /api/contacts
//   Query params: page, limit, search, tag, source, sortBy, sortOrder
//   Returns: PaginatedResponse<Contact>
//   Security: Only return contacts belonging to session.user.tenantId
//
// POST /api/contacts
//   Body: CreateContactInput (validated with createContactSchema)
//   Returns: Created contact
//   Side-effect: Create AuditLog entry

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createContactSchema } from "@/lib/validators/contact";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  // TODO [SHALMON]: Implement
  return NextResponse.json({ success: false, error: "Not implemented yet" }, { status: 501 });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  // TODO [SHALMON]: Implement
  return NextResponse.json({ success: false, error: "Not implemented yet" }, { status: 501 });
}
