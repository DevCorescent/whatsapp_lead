// ============================================================================
// TEMPORARY TEST ROUTE — remove before go-live
// Simulates an inbound WhatsApp message directly into the pipeline,
// bypassing Meta's webhook (which requires a published app in prod mode).
//
// POST /api/test/simulate-inbound
// Body: { from: "919876543210", message: "Hello!", name: "Test User" }
// Auth: Bearer CRON_SECRET (reuses the existing secret so it needs no new env var)
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { processIncomingMessage, resolveTenant } from "@/lib/inbound";

export async function POST(req: NextRequest) {
  // Gate on CRON_SECRET so this endpoint isn't publicly callable.
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { from, message, name, phoneNumberId } = await req.json() as {
    from: string;
    message: string;
    name?: string;
    phoneNumberId?: string;
  };

  if (!from || !message) {
    return NextResponse.json({ error: "from and message are required" }, { status: 400 });
  }

  // Use the phone_number_id from tenant settings, or the one passed in the body.
  const pid = phoneNumberId ?? process.env.TEST_PHONE_NUMBER_ID;
  if (!pid) {
    return NextResponse.json(
      { error: "Pass phoneNumberId in body or set TEST_PHONE_NUMBER_ID env var" },
      { status: 400 }
    );
  }

  try {
    const tenant = await resolveTenant(pid);

    const fakeMessage = {
      id: `sim_${Date.now()}`,
      from,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text" as const,
      text: { body: message },
    };

    const result = await processIncomingMessage(tenant, fakeMessage as never, name);

    return NextResponse.json({
      ok: true,
      conversationId: result.conversation.id,
      messageId: result.message.id,
      contactId: result.contact.id,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[SIMULATE] Error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
