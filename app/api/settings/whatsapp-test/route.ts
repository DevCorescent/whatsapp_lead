// ============================================================================
// ROUTE  : /api/settings/whatsapp-test  (legacy)
//
// Superseded by /api/settings/whatsapp/test and, for Embedded Signup numbers, by
// /api/integrations/whatsapp/test. Nothing in the app calls it since the manual
// credential form was removed; it is kept only so a deployment mid-migration does
// not 404, and can be deleted once that is confirmed.
//
// It carried two defects that were fixed rather than left in a dead file: the
// stored token was sent to Meta still encrypted (so this never actually worked on
// a deployment with ENCRYPTION_KEY set), and it was passed in the query string,
// which writes a live credential into every access log and proxy between here and
// Meta. Tokens travel in the Authorization header.
// ============================================================================

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId: session.user.tenantId },
      select: { waPhoneNumberId: true, waApiKey: true },
    });

    if (!settings?.waPhoneNumberId || !settings?.waApiKey) {
      return NextResponse.json({ success: false, error: "WhatsApp credentials not configured. Save your Phone Number ID and API Key first." }, { status: 400 });
    }

    const token = decryptSecret(settings.waApiKey);
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Stored WhatsApp credentials could not be read." },
        { status: 400 },
      );
    }

    const apiVersion = process.env.WHATSAPP_API_VERSION ?? "v19.0";
    const url = `https://graph.facebook.com/${apiVersion}/${settings.waPhoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating`;

    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (!res.ok) {
      // Meta's message only. The full body has been observed to echo request context,
      // and this line runs on a path that handles a live credential.
      const msg = data?.error?.message ?? `Meta API error (${res.status})`;
      console.error("[whatsapp-test] Meta rejected the check", { status: res.status, meta: msg });
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: {
        phoneNumber: data.display_phone_number ?? settings.waPhoneNumberId,
        verifiedName: data.verified_name ?? "—",
        qualityRating: data.quality_rating ?? "—",
      },
    });
  } catch (err) {
    console.error("[whatsapp-test] ERROR:", err);
    return NextResponse.json({ success: false, error: "Failed to reach Meta API" }, { status: 500 });
  }
}
