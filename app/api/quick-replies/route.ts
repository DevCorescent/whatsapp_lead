// Quick replies: the canned responses an agent expands in the inbox by typing "/shortcode".
//
// Scoped to a business rather than only to a tenant, matching the QuickReply model's own
// `@@unique([shortcode, businessId])` — two businesses under one workspace are separate
// front-desks and may legitimately want the same shortcode to expand to different text.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";

/**
 * A shortcode is what the agent types, so it is normalised rather than taken literally: stored
 * without a leading slash and lower-cased, so "/Hi" and "hi" cannot become two entries that the
 * composer would then have to disambiguate at keystroke time.
 */
const shortcodeSchema = z
  .string()
  .trim()
  .min(1, "Shortcode is required")
  .max(32, "Shortcode must be 32 characters or fewer")
  .transform((s) => s.replace(/^\//, "").toLowerCase())
  .refine((s) => /^[a-z0-9._-]+$/.test(s), "Shortcode may only contain letters, numbers, . _ and -");

const createQuickReplySchema = z.object({
  shortcode: shortcodeSchema,
  content: z.string().trim().min(1, "Content is required").max(4096, "Content is too long"),
});

export async function GET() {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { businessId } = scope;

  try {
    const quickReplies = await prisma.quickReply.findMany({
      where: { businessId },
      orderBy: { shortcode: "asc" },
    });
    return NextResponse.json({ success: true, data: quickReplies });
  } catch (error) {
    console.error("[QUICK REPLIES GET]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch quick replies" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId } = scope;

  try {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = createQuickReplySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const { shortcode, content } = parsed.data;

    const existing = await prisma.quickReply.findFirst({ where: { shortcode, businessId } });
    if (existing) return NextResponse.json({ success: false, error: "A quick reply with this shortcode already exists" }, { status: 409 });

    const quickReply = await prisma.quickReply.create({
      data: { tenantId, businessId, shortcode, content },
    });

    return NextResponse.json({ success: true, data: quickReply }, { status: 201 });
  } catch (error) {
    console.error("[QUICK REPLIES POST]", error);
    return NextResponse.json({ success: false, error: "Failed to create quick reply" }, { status: 500 });
  }
}
