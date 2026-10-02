// ROUTE: GET /api/settings/whatsapp-health
// Fetches live account health data from the Meta Graph API for the workspace's
// connected WhatsApp Business number: display name, quality rating, messaging
// tier, current usage window, and whether the account is flagged.

import { NextResponse } from "next/server";
import { getBusinessScope } from "@/lib/business";
import { getBusinessTemplateCreds } from "@/lib/templates";
import { prisma } from "@/lib/prisma";

const GRAPH = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION ?? "v19.0"}`;

export async function GET() {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  // Look up the phone number ID for this business
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: scope.tenantId },
    select: { waPhoneNumberId: true },
  });

  const phoneNumberId = settings?.waPhoneNumberId;
  if (!phoneNumberId) {
    return NextResponse.json({ success: false, error: "No WhatsApp number connected" }, { status: 404 });
  }

  let apiKey: string;
  try {
    ({ apiKey } = await getBusinessTemplateCreds(scope.businessId));
  } catch {
    return NextResponse.json({ success: false, error: "API credentials not configured" }, { status: 400 });
  }

  try {
    // 1. Phone number details — display name, quality, status, messaging tier
    const phoneRes = await fetch(
      `${GRAPH}/${phoneNumberId}?fields=display_phone_number,verified_name,code_verification_status,quality_rating,messaging_limit_tier,account_mode,is_official_business_account,name_status,new_name_status,last_onboarded_time`,
      { headers: { Authorization: `Bearer ${apiKey}` }, next: { revalidate: 0 } },
    );
    const phoneJson = (await phoneRes.json()) as Record<string, unknown>;

    // 2. Business profile
    const profileRes = await fetch(
      `${GRAPH}/${phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`,
      { headers: { Authorization: `Bearer ${apiKey}` }, next: { revalidate: 0 } },
    );
    const profileJson = (await profileRes.json()) as { data?: unknown[]; error?: { message?: string } };
    const profile = Array.isArray(profileJson.data) ? profileJson.data[0] : null;

    if (!phoneRes.ok) {
      const err = (phoneJson as { error?: { message?: string } }).error;
      return NextResponse.json({ success: false, error: err?.message ?? "Meta API error" }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      data: {
        phoneNumber: phoneJson.display_phone_number,
        verifiedName: phoneJson.verified_name,
        qualityRating: phoneJson.quality_rating,           // GREEN | YELLOW | RED | UNKNOWN
        messagingLimitTier: phoneJson.messaging_limit_tier, // TIER_1K | TIER_10K | TIER_100K | TIER_UNLIMITED
        accountMode: phoneJson.account_mode,               // LIVE | SANDBOX
        isOfficialBusiness: phoneJson.is_official_business_account,
        nameStatus: phoneJson.name_status,                 // APPROVED | PENDING_REVIEW | DECLINED | etc.
        codeVerificationStatus: phoneJson.code_verification_status,
        lastOnboarded: phoneJson.last_onboarded_time,
        profile,
      },
    });
  } catch (error) {
    console.error("[WHATSAPP HEALTH]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch health data" }, { status: 502 });
  }
}
