/**
 * GET /api/media/whatsapp-proxy?messageId=xxx
 *
 * Proxy for WhatsApp media (images, videos, documents) received from customers.
 *
 * Meta's media URLs are:
 *   1. Not publicly accessible — they require Authorization: Bearer <token>
 *   2. Short-lived — they expire in minutes
 *
 * So we can't store them. Instead we store the media ID in message.metadata and
 * fetch the bytes on demand here, streaming them straight to the browser.
 *
 * This endpoint is auth-gated (must be a logged-in user of the same tenant).
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMediaUrl } from "@/lib/whatsapp";
import { resolveConversationWhatsAppCreds } from "@/lib/business";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId } = session.user;

  const messageId = req.nextUrl.searchParams.get("messageId");
  if (!messageId) {
    return NextResponse.json({ error: "messageId is required" }, { status: 400 });
  }

  // Load the message and its conversation — scope to this tenant
  const message = await prisma.message.findFirst({
    where: { id: messageId, tenantId },
    select: {
      id: true,
      mediaType: true,
      mediaMimeType: true,
      metadata: true,
      conversation: {
        select: {
          businessId: true,
          tenantId: true,
          whatsappIntegrationId: true,
        },
      },
    },
  });

  if (!message) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const meta = message.metadata as Record<string, unknown> | null;
  if (!meta) {
    return NextResponse.json({ error: "No media metadata" }, { status: 404 });
  }

  // Extract the media ID — Meta stores it at metadata.<type>.id
  const mediaType = (message.mediaType ?? "").toLowerCase();
  const mediaObj = (
    meta[mediaType] ??
    meta["image"] ??
    meta["video"] ??
    meta["audio"] ??
    meta["document"] ??
    meta["sticker"]
  ) as Record<string, unknown> | undefined;

  const mediaId = typeof mediaObj?.id === "string" ? mediaObj.id : null;
  if (!mediaId) {
    return NextResponse.json({ error: "Media ID not found in message metadata" }, { status: 404 });
  }

  // Resolve WhatsApp credentials for this conversation
  const creds = await resolveConversationWhatsAppCreds({
    businessId: message.conversation.businessId,
    tenantId: message.conversation.tenantId,
    whatsappIntegrationId: message.conversation.whatsappIntegrationId,
  });

  if (!creds.apiKey) {
    return NextResponse.json({ error: "WhatsApp not connected" }, { status: 503 });
  }

  try {
    // Step 1: ask Meta for the authenticated download URL
    const mediaInfo = await getMediaUrl(mediaId, creds.apiKey);

    // Step 2: download the bytes from Meta (requires the same token)
    const downstream = await fetch(mediaInfo.url, {
      headers: { Authorization: `Bearer ${creds.apiKey}` },
    });

    if (!downstream.ok) {
      return NextResponse.json(
        { error: `Meta returned ${downstream.status} for media download` },
        { status: 502 },
      );
    }

    const contentType =
      mediaInfo.mime_type ?? message.mediaMimeType ?? "application/octet-stream";

    // Step 3: stream bytes straight to the browser
    return new NextResponse(downstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Cache for 1 hour — the bytes don't change, only the Meta URL expires
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch media";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
