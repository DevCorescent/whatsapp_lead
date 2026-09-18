import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  console.log("Starting WhatsApp integration backfill...");

  const businesses = await prisma.business.findMany({
    where: {
      whatsappPhoneNumberId: {
        not: null,
      },
    },
    select: {
      id: true,
      tenantId: true,
      name: true,
      whatsappPhoneNumber: true,
      whatsappPhoneNumberId: true,
      whatsappBusinessId: true,
      whatsappAccessToken: true,
      whatsappVerifyToken: true,
      whatsappAppSecret: true,
    },
  });

  console.log(
    `Found ${businesses.length} business(es) with WhatsApp configuration.`,
  );

  let created = 0;
  let skipped = 0;

  for (const business of businesses) {
    if (
      !business.whatsappPhoneNumberId ||
      !business.whatsappBusinessId ||
      !business.whatsappAccessToken
    ) {
      console.log(
        `Skipping ${business.name} (${business.id}) — incomplete WhatsApp configuration.`,
      );
      skipped++;
      continue;
    }

    const existing = await prisma.whatsAppIntegration.findUnique({
      where: {
        businessId_phoneNumberId: {
          businessId: business.id,
          phoneNumberId: business.whatsappPhoneNumberId,
        },
      },
    });

    if (existing) {
      console.log(
        `Already exists: ${business.name} → ${business.whatsappPhoneNumberId}`,
      );
      skipped++;
      continue;
    }

    await prisma.whatsAppIntegration.create({
      data: {
        tenantId: business.tenantId,
        businessId: business.id,

        displayName: business.name,
        phoneNumber: business.whatsappPhoneNumber,
        phoneNumberId: business.whatsappPhoneNumberId,
        whatsappBusinessId: business.whatsappBusinessId,

        // Already encrypted in the legacy Business field.
        accessToken: business.whatsappAccessToken,

        verifyToken: business.whatsappVerifyToken,
        appSecret: business.whatsappAppSecret,

        isActive: true,
        isDefault: true,
      },
    });

    console.log(
      `Created integration: ${business.name} → ${business.whatsappPhoneNumberId}`,
    );

    created++;
  }

  console.log("\nBackfill complete.");
  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped}`);
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});