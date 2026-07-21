import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
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

    const apiVersion = process.env.WHATSAPP_API_VERSION ?? "v19.0";
    const url = `https://graph.facebook.com/${apiVersion}/${settings.waPhoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating&access_token=${settings.waApiKey}`;

    const res = await fetch(url, { method: "GET" });
    const data = await res.json();

    if (!res.ok) {
      const msg = data?.error?.message ?? `Meta API error (${res.status})`;
      console.error("[whatsapp-test] Meta API error:", data);
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
