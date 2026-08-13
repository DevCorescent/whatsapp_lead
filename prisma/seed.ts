// Seed file – run with: npx prisma db seed
// Creates: 3 plans + 1 demo tenant + 1 demo user (for testing)
//
// TODO [SHALMON]: Add more seed data (sample contacts, leads, conversations) for demo.

import "dotenv/config";
import bcrypt from "bcryptjs";
// Prisma 7 needs a driver adapter, which lib/prisma.ts already configures.
// Constructing a bare PrismaClient() here throws at startup.
import { prisma } from "../lib/prisma";
import { DEFAULT_PIPELINE_STAGES } from "../lib/utils";

async function main() {
  console.log("🌱 Seeding database...");

  // ─── Plans ──────────────────────────────────────────────────────────────────
  // These field sets are in `update` as well as `create`, unlike everything else
  // here. They were added to Plan after these rows existed, so an existing
  // database has them at column defaults — maxBusinesses 1 for every tier,
  // including Enterprise, and no plan carrying the Most Popular badge at all.
  // Re-running the seed is what corrects that, and it touches only these fields;
  // prices and limits edited in the admin UI stay as they are.
  //
  // isPopular is seeded false on all three on purpose. It is an override, not the
  // source of truth: the Plans page gives the badge to whichever plan has the most
  // subscribers and falls back to Growth when there is no clear leader, so pinning
  // anything here would switch that off before it ever ran. It is written on every
  // plan rather than left alone so a re-seed also clears a pin set by hand.
  const STARTER_CAPS = {
    isPopular: false,
    maxMsgPerDay: 500,
    maxMsgPerHour: 100,
    maxBusinesses: 1,
    maxKnowledgeDocs: 10,
    maxTemplates: 10,
    maxQuickReplies: 20,
    maxCampaignRecipients: 500,
    maxUploadMb: 5,
    retentionDays: 90,
    allowedAiModels: [] as string[],
    allowExport: false,
  };

  await prisma.plan.upsert({
    where: { name: "STARTER" },
    update: STARTER_CAPS,
    create: {
      name: "STARTER",
      displayName: "Starter",
      description: "Perfect for small teams",
      priceMonthly: 999,
      priceAnnual: 9590,
      maxContacts: 1000,
      maxMsgPerMonth: 5000,
      maxAgents: 3,
      maxCampaigns: 5,
      maxFlows: 3,
      ...STARTER_CAPS,
      aiEnabled: false,
      ragEnabled: false,
      whiteLabel: false,
      features: ["WhatsApp Inbox", "CRM", "Basic Analytics", "Lead Management"],
      sortOrder: 1,
    },
  });

  const GROWTH_CAPS = {
    isPopular: false,
    maxMsgPerDay: 5000,
    maxMsgPerHour: 750,
    maxBusinesses: 3,
    maxKnowledgeDocs: 100,
    maxTemplates: 50,
    maxQuickReplies: 100,
    maxCampaignRecipients: 5000,
    maxUploadMb: 10,
    retentionDays: 365,
    allowedAiModels: [] as string[],
    allowExport: true,
  };

  await prisma.plan.upsert({
    where: { name: "GROWTH" },
    update: GROWTH_CAPS,
    create: {
      name: "GROWTH",
      displayName: "Growth",
      description: "For growing businesses",
      priceMonthly: 2999,
      priceAnnual: 28790,
      maxContacts: 10000,
      maxMsgPerMonth: 50000,
      maxAgents: 10,
      maxCampaigns: 25,
      maxFlows: 10,
      ...GROWTH_CAPS,
      aiEnabled: true,
      ragEnabled: true,
      whiteLabel: false,
      features: ["Everything in Starter", "AI Auto-Reply", "Knowledge Base (RAG)", "Campaign Management", "Chatbot Builder", "Advanced Analytics"],
      sortOrder: 2,
    },
  });

  // 0 is the unlimited sentinel — Enterprise is not rate limited, but it is still
  // capped on businesses so the tier has something concrete to sell.
  const ENTERPRISE_CAPS = {
    isPopular: false,
    maxMsgPerDay: 0,
    maxMsgPerHour: 0,
    maxBusinesses: 25,
    maxKnowledgeDocs: 0,
    maxTemplates: 0,
    maxQuickReplies: 0,
    maxCampaignRecipients: 0,
    maxUploadMb: 50,
    retentionDays: 0,
    allowedAiModels: [] as string[],
    allowExport: true,
  };

  await prisma.plan.upsert({
    where: { name: "ENTERPRISE" },
    update: ENTERPRISE_CAPS,
    create: {
      name: "ENTERPRISE",
      displayName: "Enterprise",
      description: "For large organizations",
      priceMonthly: 9999,
      priceAnnual: 95990,
      maxContacts: 100000,
      maxMsgPerMonth: 500000,
      maxAgents: 100,
      maxCampaigns: 100,
      maxFlows: 50,
      ...ENTERPRISE_CAPS,
      aiEnabled: true,
      ragEnabled: true,
      whiteLabel: true,
      advancedAi: true,
      features: ["Everything in Growth", "White Label", "Custom Domain", "Advanced AI", "Dedicated Support", "SLA Agreement"],
      sortOrder: 3,
    },
  });

  console.log("✅ Plans created");

  // ─── Demo Tenant ────────────────────────────────────────────────────────────
  const demoTenant = await prisma.tenant.upsert({
    where: { slug: "demo-workspace" },
    update: {},
    create: {
      name: "Demo Workspace",
      slug: "demo-workspace",
      settings: { create: {} },
    },
  });

  // ─── Demo Subscription ──────────────────────────────────────────────────────
  //
  // Without this the demo workspace has no Subscription row at all, which
  // resolveTenantPlan reads as the implicit free tier — and the free tier grants
  // no AI, no knowledge base and no export. The demo would then be unable to
  // demonstrate the three features the product is mostly sold on. Growth is the
  // right tier for it: everything except white label and lead scoring, so the
  // gates are visibly doing something rather than switched off wholesale.
  const growthPlan = await prisma.plan.findUnique({ where: { name: "GROWTH" } });

  if (growthPlan) {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);

    await prisma.subscription.upsert({
      where: { tenantId: demoTenant.id },
      // Only the plan link is corrected on re-seed. Overwriting the period or
      // resetting aiCreditsUsed would wipe real usage on a workspace someone has
      // been demoing from all week.
      update: { planId: growthPlan.id },
      create: {
        tenantId: demoTenant.id,
        planId: growthPlan.id,
        status: "ACTIVE",
        billingCycle: "ANNUAL",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });
    console.log("✅ Demo subscription (Growth) created");
  }

  // ─── Demo User (admin) ──────────────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash("Demo@1234", 12);

  await prisma.user.upsert({
    where: { email_tenantId: { email: "admin@demo.com", tenantId: demoTenant.id } },
    update: {},
    create: {
      tenantId: demoTenant.id,
      name: "Demo Admin",
      email: "admin@demo.com",
      password: hashedPassword,
      role: "TENANT_OWNER",
    },
  });

  // ─── Super Admin ────────────────────────────────────────────────────────────
  const superAdminPassword = await bcrypt.hash("SuperAdmin@2026", 12);

  await prisma.user.upsert({
    where: { email_tenantId: { email: "superadmin@whatscrm.app", tenantId: demoTenant.id } },
    update: {},
    create: {
      tenantId: demoTenant.id,
      name: "Super Admin",
      email: "superadmin@whatscrm.app",
      password: superAdminPassword,
      role: "SUPER_ADMIN",
    },
  });

  // ─── Default pipeline stages for the demo tenant ────────────────────────────
  // Every tenant needs at least the default set so leads always have a stage to
  // reference. `createMany({ skipDuplicates })` keeps the seed idempotent.
  await prisma.pipelineStage.createMany({
    data: DEFAULT_PIPELINE_STAGES.map((s, index) => ({
      tenantId: demoTenant.id,
      name: s.name,
      color: s.color,
      order: index,
      enabled: true,
      isDefault: s.isDefault,
      outcome: s.outcome,
    })),
    skipDuplicates: true,
  });

  console.log("✅ Demo tenant + user + pipeline stages created");
  console.log("   Email: admin@demo.com");
  console.log("   Password: Demo@1234");
  console.log("\n✅ Super Admin created");
  console.log("   Email: superadmin@whatscrm.app");
  console.log("   Password: SuperAdmin@2026");
  console.log("\n🎉 Seed complete!");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
