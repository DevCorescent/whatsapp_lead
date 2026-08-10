import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { registerSchema } from "@/lib/validators/auth";

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validate access token if env var is configured.
    // Trim both sides: Vercel env values often pick up trailing newlines or wrapping quotes
    // ("CORESCENT-2026"), which makes a strict === fail even when the UI shows the right token.
    const requiredToken = process.env.SIGNUP_ACCESS_TOKEN?.trim().replace(/^["']|["']$/g, "");
    if (requiredToken) {
      const providedToken =
        typeof (body as Record<string, unknown>).accessToken === "string"
          ? ((body as Record<string, unknown>).accessToken as string).trim()
          : "";
      if (!providedToken || providedToken !== requiredToken) {
        console.warn("[REGISTER] Access token mismatch", {
          providedLength: providedToken.length,
          requiredLength: requiredToken.length,
          providedPrefix: providedToken.slice(0, 4),
          requiredPrefix: requiredToken.slice(0, 4),
        });
        return NextResponse.json(
          { success: false, error: "Invalid access token. Contact us to get access." },
          { status: 403 }
        );
      }
    }

    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { name, email, password, workspaceName } = parsed.data;

    // Check if email already exists
    const existingUser = await prisma.user.findFirst({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: "Email already registered" },
        { status: 409 }
      );
    }

    // Generate unique tenant slug
    let slug = slugify(workspaceName);
    const existingSlug = await prisma.tenant.findUnique({ where: { slug } });
    if (existingSlug) slug = `${slug}-${Date.now()}`;

    const hashedPassword = await bcrypt.hash(password, 12);

    // Create tenant + owner user + default settings + starter plan subscription
    const starterPlan = await prisma.plan.findFirst({ where: { name: "STARTER" } });

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: workspaceName,
          slug,
          settings: { create: {} },
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name,
          email,
          password: hashedPassword,
          role: "TENANT_OWNER",
        },
      });

      if (starterPlan) {
        await tx.subscription.create({
          data: {
            tenantId: tenant.id,
            planId: starterPlan.id,
            status: "TRIALING",
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 day trial
            trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          },
        });
      }

      return { tenant, user };
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          userId: result.user.id,
          tenantId: result.tenant.id,
          tenantSlug: result.tenant.slug,
        },
        message: "Account created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[REGISTER]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
