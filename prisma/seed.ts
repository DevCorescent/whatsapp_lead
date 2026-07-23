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
  await prisma.plan.upsert({
    where: { name: "STARTER" },
    update: {},
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
      aiEnabled: false,
      ragEnabled: false,
      whiteLabel: false,
      features: ["WhatsApp Inbox", "CRM", "Basic Analytics", "Lead Management"],
      sortOrder: 1,
    },
  });

  await prisma.plan.upsert({
    where: { name: "GROWTH" },
    update: {},
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
      aiEnabled: true,
      ragEnabled: true,
      whiteLabel: false,
      features: ["Everything in Starter", "AI Auto-Reply", "Knowledge Base (RAG)", "Campaign Management", "Chatbot Builder", "Advanced Analytics"],
      sortOrder: 2,
    },
  });

  await prisma.plan.upsert({
    where: { name: "ENTERPRISE" },
    update: {},
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
