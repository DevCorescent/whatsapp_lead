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

const EDIT_ROLES = ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"];
const WA_BASE_URL = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION ?? "v19.0"}`;

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
    const res = await fetch(
      `${WA_BASE_URL}/${phoneNumberId}?fields=verified_name,display_phone_number,quality_rating`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );

    // Meta returns JSON on success and on most errors, but can emit HTML on
    // gateway failures — read defensively so the handler never throws on parse.
    const rawText = await res.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = rawText ? JSON.parse(rawText) : {};
    } catch {
      parsed = {};
    }

    if (!res.ok) {
      const metaError =
        (parsed.error as { message?: string } | undefined)?.message ??
        `Meta returned ${res.status} ${res.statusText}`;
      return NextResponse.json({ success: false, error: metaError }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: {
        verifiedName: parsed.verified_name ?? null,
        displayPhoneNumber: parsed.display_phone_number ?? null,
        qualityRating: parsed.quality_rating ?? null,
      },
    });
  } catch (error) {
    console.error("[WA TEST]", error);
    return NextResponse.json(
      { success: false, error: "Could not reach the WhatsApp Cloud API" },
      { status: 502 },
    );
  }
}
