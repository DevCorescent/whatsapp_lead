import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
  language: z.string().default("en"),
  body: z.string().min(1, "Body is required"),
  headerType: z.enum(["TEXT", "IMAGE", "VIDEO", "DOCUMENT"]).optional(),
  headerContent: z.string().optional(),
  footer: z.string().optional(),
  buttons: z.array(z.object({
    type: z.enum(["QUICK_REPLY", "URL", "PHONE_NUMBER"]),
    text: z.string(),
    url: z.string().optional(),
    phone: z.string().optional(),
  })).optional(),
  variables: z.array(z.string()).default([]),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    const templates = await prisma.messageTemplate.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, data: templates });
  } catch (error) {
    console.error("[TEMPLATES GET]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch templates" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = createTemplateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const data = parsed.data;

    // Check for duplicate name
    const existing = await prisma.messageTemplate.findFirst({ where: { name: data.name, tenantId } });
    if (existing) return NextResponse.json({ success: false, error: "Template with this name already exists" }, { status: 409 });

    const template = await prisma.messageTemplate.create({
      data: {
        tenantId,
        name: data.name,
        category: data.category,
        language: data.language,
        body: data.body,
        status: "PENDING",
        variables: data.variables,
        ...(data.headerType && { headerType: data.headerType }),
        ...(data.headerContent && { headerContent: data.headerContent }),
        ...(data.footer && { footer: data.footer }),
        ...(data.buttons && { buttons: data.buttons }),
      },
    });

    return NextResponse.json({ success: true, data: template }, { status: 201 });
  } catch (error) {
    console.error("[TEMPLATES POST]", error);
    return NextResponse.json({ success: false, error: "Failed to create template" }, { status: 500 });
  }
}
