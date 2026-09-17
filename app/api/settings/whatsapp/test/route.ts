// ============================================================================
// MODULE : WhatsApp connection test
// ROUTE  : POST /api/settings/whatsapp/test
//
// Validates a tenant's WhatsApp Cloud API credentials by fetching the phone
// number's metadata from the Meta Graph API. Tests the saved credentials by
// default; an optional { phoneNumberId, apiKey } body lets an operator verify a
// new access token before committing it (the saved token is masked in the UI, so
// re-testing after a save is the normal path).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { getPhoneNumberDetails, MetaApiError } from "@/lib/whatsapp";

const EDIT_ROLES = ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId, role } = session.user;

  if (!EDIT_ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  // The body is optional — an empty POST tests whatever is stored.
  let body: { phoneNumberId?: string; apiKey?: string } = {};
  try {
    const raw = await req.text();
    if (raw) body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: { waPhoneNumberId: true, waApiKey: true },
  });

  const phoneNumberId = body.phoneNumberId?.trim() || settings?.waPhoneNumberId || "";
  let apiKey = body.apiKey?.trim() || "";
  if (!apiKey) {
    try {
      apiKey = decryptSecret(settings?.waApiKey) ?? "";
    } catch (error) {
      console.error("[WA TEST] Failed to decrypt stored token:", error);
      return NextResponse.json(
        { success: false, error: "Stored access token could not be decrypted" },
        { status: 500 },
      );
    }
  }

  if (!phoneNumberId || !apiKey) {
    return NextResponse.json(
      { success: false, error: "Add a Phone Number ID and access token first, then test." },
      { status: 400 },
    );
  }

  try {
    // The Graph call itself lives in lib/whatsapp.ts so that this route, the
    // business-scoped test and the Embedded Signup verification all make the same
    // request with the same field list and the same error mapping.
    const details = await getPhoneNumberDetails(phoneNumberId, apiKey);

    return NextResponse.json({
      success: true,
      data: {
        verifiedName: details.verified_name ?? null,
        displayPhoneNumber: details.display_phone_number ?? null,
        qualityRating: details.quality_rating ?? null,
      },
    });
  } catch (error) {
    // Meta answering non-2xx keeps the 400 this route has always returned; only a
    // transport failure falls through to the 502 below.
    if (error instanceof MetaApiError) {
      return NextResponse.json({ success: false, error: error.metaMessage }, { status: 400 });
    }
    console.error("[WA TEST]", error);
    return NextResponse.json(
      { success: false, error: "Could not reach the WhatsApp Cloud API" },
      { status: 502 },
    );
  }
}
