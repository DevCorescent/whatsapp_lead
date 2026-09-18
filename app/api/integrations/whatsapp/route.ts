import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";

export async function GET(request: Request) {
  try {
    const scope = await getBusinessScope();

    // No authenticated business context.
    if (!scope) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const requestedBusinessId = searchParams.get("businessId");

    // Use the explicitly requested business when provided.
    // Otherwise use the current business resolved by getBusinessScope().
    const businessId = requestedBusinessId ?? scope.businessId;

    // Always verify the business belongs to the current tenant.
    // This preserves tenant isolation even if a user sends another businessId.
    const business = await prisma.business.findFirst({
      where: {
        id: businessId,
        tenantId: scope.tenantId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!business) {
      return NextResponse.json(
        {
          success: false,
          error: "Business not found",
        },
        { status: 404 },
      );
    }

    const integrations = await prisma.whatsAppIntegration.findMany({
      where: {
        tenantId: scope.tenantId,
        businessId: business.id,
      },
      select: {
        id: true,
        businessId: true,
        displayName: true,
        phoneNumber: true,
        phoneNumberId: true,
        whatsappBusinessId: true,
        qualityRating: true,
        codeVerificationStatus: true,
        isActive: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [
        { isDefault: "desc" },
        { createdAt: "asc" },
      ],
    });

    return NextResponse.json({
      success: true,
      data: {
        business: {
          id: business.id,
          name: business.name,
        },
        integrations,
      },
    });
  } catch (error) {
    console.error("[whatsapp integrations] GET failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Could not load WhatsApp integrations",
      },
      { status: 500 },
    );
  }
}