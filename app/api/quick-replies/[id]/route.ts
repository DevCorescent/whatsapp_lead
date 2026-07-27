// Edit and delete for a single quick reply. Both scope the lookup by `businessId` as well as `id`,
// so a guessed cuid from another workspace resolves to 404 rather than to someone else's row.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";

const shortcodeSchema = z
  .string()
  .trim()
  .min(1, "Shortcode is required")
  .max(32, "Shortcode must be 32 characters or fewer")
  .transform((s) => s.replace(/^\//, "").toLowerCase())
  .refine((s) => /^[a-z0-9._-]+$/.test(s), "Shortcode may only contain letters, numbers, . _ and -");

const updateQuickReplySchema = z
  .object({
    shortcode: shortcodeSchema.optional(),
    content: z.string().trim().min(1, "Content is required").max(4096, "Content is too long").optional(),
  })
  .refine((v) => v.shortcode !== undefined || v.content !== undefined, {
    message: "Provide at least one of: shortcode, content",
  });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { businessId } = scope;

  try {
    const { id } = await params;

    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = updateQuickReplySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const existing = await prisma.quickReply.findFirst({ where: { id, businessId } });
    if (!existing) return NextResponse.json({ success: false, error: "Quick reply not found" }, { status: 404 });

    const { shortcode, content } = parsed.data;

    // Renaming onto a shortcode another entry already holds would violate the model's unique
    // constraint; answering 409 keeps that a validation result rather than a 500.
    if (shortcode && shortcode !== existing.shortcode) {
      const clash = await prisma.quickReply.findFirst({ where: { shortcode, businessId } });
      if (clash) return NextResponse.json({ success: false, error: "A quick reply with this shortcode already exists" }, { status: 409 });
    }

    const quickReply = await prisma.quickReply.update({
      where: { id },
      data: {
        ...(shortcode !== undefined && { shortcode }),
        ...(content !== undefined && { content }),
      },
    });

    return NextResponse.json({ success: true, data: quickReply });
  } catch (error) {
    console.error("[QUICK REPLY PATCH]", error);
    return NextResponse.json({ success: false, error: "Failed to update quick reply" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { businessId } = scope;

  try {
    const { id } = await params;
    const existing = await prisma.quickReply.findFirst({ where: { id, businessId } });
    if (!existing) return NextResponse.json({ success: false, error: "Quick reply not found" }, { status: 404 });

    await prisma.quickReply.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[QUICK REPLY DELETE]", error);
    return NextResponse.json({ success: false, error: "Failed to delete quick reply" }, { status: 500 });
  }
}
