// ============================================================================
// ROUTE  : /api/settings/whatsapp-test
// GET    - Ask Meta whether the *active workspace's* credentials actually work.
//
// The credentials tested are the ones the active business would send with, resolved through
// `resolveWhatsAppCreds` — the same helper the message route, the campaign runner and the inbound
// pipeline use. Reading the tenant row directly, as this route used to, tested a different set of
// credentials than the ones a send would use the moment a tenant ran more than one WhatsApp
// account: the test passed against the tenant's legacy number while the workspace the user was
// looking at sent from another, or from none at all.
// ============================================================================

import { NextResponse } from "next/server";
import { getBusinessScope, resolveWhatsAppCreds } from "@/lib/business";

export async function GET() {
  try {
    const scope = await getBusinessScope();
    if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    let creds;
    try {
      creds = await resolveWhatsAppCreds(scope.businessId);
    } catch (error) {
      // resolveWhatsAppCreds throws only when a stored token is encrypted and ENCRYPTION_KEY is
      // missing or wrong. That is a deployment problem, not a Meta problem, and saying so is more
      // useful than reporting a connection failure the operator would go looking for at Meta.
      console.error("[whatsapp-test] Failed to resolve credentials:", error);
      return NextResponse.json(
        { success: false, error: "Stored credentials could not be read on this deployment. Re-enter the access token." },
        { status: 400 },
      );
    }

    if (!creds.phoneNumberId || !creds.apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: `WhatsApp is not connected for "${scope.business.name}". Save this workspace's Phone Number ID and access token first.`,
        },
        { status: 400 },
      );
    }

    const apiVersion = process.env.WHATSAPP_API_VERSION ?? "v19.0";
    const url = `https://graph.facebook.com/${apiVersion}/${creds.phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating`;

    // The token travels in the Authorization header rather than the query string: a URL is logged
    // by every proxy it passes through, and an access token in one is a leaked credential.
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${creds.apiKey}` },
    });
    const data = await res.json();

    if (!res.ok) {
      const msg = data?.error?.message ?? `Meta API error (${res.status})`;
      console.error("[whatsapp-test] Meta API error:", data);
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: {
        phoneNumber: data.display_phone_number ?? creds.phoneNumberId,
        verifiedName: data.verified_name ?? "—",
        qualityRating: data.quality_rating ?? "—",
        workspace: scope.business.name,
      },
    });
  } catch (err) {
    console.error("[whatsapp-test] ERROR:", err);
    return NextResponse.json({ success: false, error: "Failed to reach Meta API" }, { status: 500 });
  }
}
