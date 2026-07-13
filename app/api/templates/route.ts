// TODO [GAURANSH]: WhatsApp message template endpoints.
//
// GET /api/templates
//   - List tenant's saved templates (from DB)
//   - Also fetch live status from WhatsApp API (APPROVED/PENDING/REJECTED)
//
// POST /api/templates
//   - Body: { name, category, language, components }
//   - Submit to WhatsApp Business API for approval
//   - Save to MessageTemplate table with status PENDING
//
// WhatsApp template categories: MARKETING, UTILITY, AUTHENTICATION
// Components: HEADER (text/image/video/document), BODY (required), FOOTER, BUTTONS

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  // TODO [GAURANSH]: Implement
  return NextResponse.json({ success: false, error: "Not implemented yet" }, { status: 501 });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  // TODO [GAURANSH]: Implement
  return NextResponse.json({ success: false, error: "Not implemented yet" }, { status: 501 });
}
