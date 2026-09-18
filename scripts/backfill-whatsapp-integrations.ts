// ============================================================================
// Backfill: mirror legacy hand-entered WhatsApp credentials into
// WhatsAppIntegration rows.
//
//   npm run db:backfill-whatsapp             # apply
//   npm run db:backfill-whatsapp -- --dry-run  # report only, write nothing
//
// Run AFTER prisma/migrations/20260918120000_whatsapp_integrations.
//
// Uses the exact code path the app uses (syncLegacyIntegration), so it is safe to
// re-run and makes the same decisions the app would:
//   · only complete credentials with a valid Meta token are mirrored;
//   · a number already connected elsewhere is skipped, never duplicated;
//   · the mirrored number becomes the business's default only if it has none;
//   · the business's existing threads are attached to that number.
//
// Additive only: no legacy column is modified or cleared.
//
// TenantSettings credentials that no Business carries are reported, not moved:
// re-saving Settings → WhatsApp once copies them onto a business and mirrors them.
// ============================================================================

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { syncLegacyIntegration } from "../lib/whatsappIntegrations";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  console.log(`WhatsApp integration backfill${dryRun ? " (dry run — nothing will be written)" : ""}`);

  const businesses = await prisma.business.findMany({
    where: { whatsappPhoneNumberId: { not: null } },
    select: {
      id: true,
      name: true,
      whatsappPhoneNumberId: true,
      whatsappBusinessId: true,
      whatsappAccessToken: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${businesses.length} business(es) with a legacy WhatsApp number.`);

  const counts = { created: 0, updated: 0, skipped: 0 };

  for (const business of businesses) {
    const label = `${business.name} (${business.id}) → ${business.whatsappPhoneNumberId}`;

    if (dryRun) {
      const complete = Boolean(business.whatsappBusinessId && business.whatsappAccessToken);
      const existing = await prisma.whatsAppIntegration.findUnique({
        where: { phoneNumberId: business.whatsappPhoneNumberId! },
        select: { businessId: true },
      });
      const plan = !complete
        ? "skip: incomplete credentials"
        : existing && existing.businessId !== business.id
          ? "skip: number connected to another business"
          : existing
            ? "update existing row"
            : "create row";
      console.log(`  ${label}: ${plan}`);
      continue;
    }

    const result = await syncLegacyIntegration(business.id);
    if (result.status === "synced") {
      if (result.created) counts.created++;
      else counts.updated++;
      console.log(`  ${label}: ${result.created ? "created" : "updated"} ${result.integrationId}`);
    } else {
      counts.skipped++;
      console.log(`  ${label}: skipped (${result.reason})`);
    }
  }

  // TenantSettings-only credentials: report so an operator can re-save them.
  const tenantOnly = await prisma.tenantSettings.findMany({
    where: { waPhoneNumberId: { not: null }, waApiKey: { not: null } },
    select: { tenantId: true, waPhoneNumberId: true },
  });
  for (const settings of tenantOnly) {
    const [onBusiness, onIntegration] = await Promise.all([
      prisma.business.findFirst({
        where: { whatsappPhoneNumberId: settings.waPhoneNumberId },
        select: { id: true },
      }),
      prisma.whatsAppIntegration.findUnique({
        where: { phoneNumberId: settings.waPhoneNumberId! },
        select: { id: true },
      }),
    ]);
    if (!onBusiness && !onIntegration) {
      console.log(
        `  Tenant ${settings.tenantId}: number ${settings.waPhoneNumberId} exists only in TenantSettings — re-save Settings → WhatsApp to attach it to a business.`,
      );
    }
  }

  console.log("\nBackfill complete.");
  if (!dryRun) {
    console.log(`Created: ${counts.created}  Updated: ${counts.updated}  Skipped: ${counts.skipped}`);
  }
}

main()
  .catch((error) => {
    console.error("Backfill failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
