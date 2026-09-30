// ============================================================================
// SCRIPT : Demo / test accounts for docs/HOW-TO-TEST.md
//
//   npx tsx scripts/seed-test-accounts.ts
//
// Creates (or, on a re-run, resets the passwords of) a full cast of accounts:
//   Client A (direct) with Owner / Admin / Manager / Marketing / Agent logins,
//   Reseller N (normal), Reseller W (white-label, brand "EduReach"),
//   Client W1 under Reseller W.
// Client A also gets sample contacts (cities, tags, custom fields, one opted
// out, one blacklisted, some leads) and wallet credit, so Segments, Blacklist
// and Wallet can be tried straight away.
//
// Every password is DEMO_PASSWORD below. Run against a staging database only.
// ============================================================================

import "dotenv/config";
import bcrypt from "bcryptjs";
import type { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { provisionAccount } from "../lib/provisioning";
import { credit } from "../lib/wallet";
import { DEFAULT_PIPELINE_STAGES } from "../lib/utils";

const DEMO_PASSWORD = "Demo@12345";

type Account = Parameters<typeof provisionAccount>[0];

/** Create the account once; on later runs find it by owner email. */
async function account(input: Account) {
  const existing = await prisma.user.findFirst({
    where: { email: input.ownerEmail },
    select: { tenant: true },
  });
  if (existing) return existing.tenant;
  const { tenant } = await provisionAccount(input);
  return tenant;
}

async function user(tenantId: string, email: string, name: string, role: UserRole) {
  const found = await prisma.user.findFirst({ where: { email } });
  if (found) return found;
  return prisma.user.create({ data: { tenantId, email, name, role, password: "!" } });
}

async function topUp(tenantId: string, rupees: number) {
  await credit(tenantId, rupees * 100, "ADJUSTMENT", {
    description: "Demo credit",
    idempotencyKey: `demo-seed-credit:${tenantId}`,
  });
}

async function main() {
  const growth = await prisma.plan.findUnique({ where: { name: "GROWTH" } });
  if (!growth) throw new Error("Plans missing — run `npm run seed` first.");

  // ── Accounts ──────────────────────────────────────────────────────────────
  const clientA = await account({
    name: "Demo Coaching Institute",
    ownerName: "Client A Owner",
    ownerEmail: "owner@clienta.test",
    accountType: "CLIENT",
    planId: growth.id,
  });
  const resellerN = await account({
    name: "Reseller N (Normal)",
    ownerName: "Reseller N Owner",
    ownerEmail: "owner@resellern.test",
    accountType: "RESELLER",
    resellerType: "NORMAL",
    commissionRate: 10,
  });
  const resellerW = await account({
    name: "Reseller W (White-label)",
    ownerName: "Reseller W Owner",
    ownerEmail: "owner@resellerw.test",
    accountType: "RESELLER",
    resellerType: "WHITE_LABEL",
    commissionRate: 15,
  });
  const clientW1 = await account({
    name: "Client W1",
    ownerName: "Client W1 Owner",
    ownerEmail: "owner@clientw1.test",
    accountType: "CLIENT",
    resellerId: resellerW.id,
    planId: growth.id,
  });

  await prisma.whiteLabelConfig.upsert({
    where: { tenantId: resellerW.id },
    update: {},
    create: {
      tenantId: resellerW.id,
      brandName: "EduReach",
      primaryColor: "#7c3aed",
      subdomain: "edureach",
      supportEmail: "support@edureach.test",
      loginHeadline: "Welcome to EduReach",
    },
  });

  // Team logins inside Client A.
  await user(clientA.id, "admin@clienta.test", "Client A Admin", "ADMIN");
  await user(clientA.id, "manager@clienta.test", "Client A Manager", "MANAGER");
  await user(clientA.id, "marketing@clienta.test", "Client A Marketing", "MARKETING_USER");
  await user(clientA.id, "agent@clienta.test", "Client A Agent", "AGENT");

  // One known password for every demo login (also resets it on re-run).
  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);
  await prisma.user.updateMany({
    where: { email: { endsWith: ".test" }, tenantId: { in: [clientA.id, resellerN.id, resellerW.id, clientW1.id] } },
    data: { password: hash, isActive: true },
  });

  // ── Wallets ───────────────────────────────────────────────────────────────
  await topUp(clientA.id, 500);
  await topUp(resellerN.id, 1000);
  await topUp(resellerW.id, 2000);
  await topUp(clientW1.id, 200);

  // ── Client A sample data ─────────────────────────────────────────────────
  // Same row the app creates on first login (lib/business.ts ensureDefaultBusiness).
  const business =
    (await prisma.business.findFirst({ where: { tenantId: clientA.id }, orderBy: { createdAt: "asc" } })) ??
    (await prisma.business.create({ data: { tenantId: clientA.id, name: clientA.name, slug: "default" } }));
  const scope = { tenantId: clientA.id, businessId: business.id };

  await prisma.pipelineStage.createMany({
    data: DEFAULT_PIPELINE_STAGES.map((s, order) => ({
      tenantId: clientA.id, name: s.name, color: s.color, order, enabled: true, isDefault: s.isDefault, outcome: s.outcome,
    })),
    skipDuplicates: true,
  });
  const stages = await prisma.pipelineStage.findMany({ where: { tenantId: clientA.id }, orderBy: { order: "asc" } });

  const tagIds: Record<string, string> = {};
  for (const [name, color] of [["Student", "#10b981"], ["Parent", "#6366f1"], ["VIP", "#f59e0b"]]) {
    const t = await prisma.tag.upsert({
      where: { name_businessId: { name, businessId: business.id } },
      update: {},
      create: { ...scope, name, color },
    });
    tagIds[name] = t.id;
  }

  // phone, name, city, tags, batch, course, source
  const people: [string, string, string, string[], string, string, string][] = [
    ["919000000001", "Aarav Sharma", "Delhi", ["Student"], "2026-A", "JEE", "Website"],
    ["919000000002", "Diya Verma", "Delhi", ["Student", "VIP"], "2026-A", "NEET", "Website"],
    ["919000000003", "Kabir Singh", "Delhi", ["Parent"], "2026-B", "JEE", "Walk-in"],
    ["919000000004", "Ananya Gupta", "Noida", ["Student"], "2026-B", "JEE", "Instagram"],
    ["919000000005", "Rohan Mehta", "Noida", ["Parent", "VIP"], "2026-A", "NEET", "Referral"],
    ["919000000006", "Isha Nair", "Mumbai", ["Student"], "2026-A", "JEE", "Website"],
    ["919000000007", "Vivaan Rao", "Mumbai", ["Student", "VIP"], "2026-B", "NEET", "Instagram"],
    ["919000000008", "Meera Iyer", "Pune", ["Parent"], "2026-A", "JEE", "Walk-in"],
    ["919000000009", "Arjun Das", "Pune", ["Student"], "2026-B", "NEET", "Referral"],
    ["919000000010", "Sara Khan", "Delhi", ["Student"], "2026-A", "JEE", "Website"], // opted out
    ["919000000011", "Nikhil Joshi", "Delhi", ["Student"], "2026-B", "JEE", "Website"], // blacklisted
    ["919000000012", "Priya Patel", "Noida", [], "2026-A", "NEET", "Instagram"],
  ];

  for (const [i, [phone, name, location, tags, batch, course, source]] of people.entries()) {
    const contact = await prisma.contact.upsert({
      where: { phone_businessId: { phone, businessId: business.id } },
      update: {},
      create: {
        ...scope, phone, name, location, source,
        email: `${name.split(" ")[0].toLowerCase()}@example.com`,
        optedOut: phone === "919000000010",
        customFields: { batch, course },
      },
    });
    await prisma.contactTag.createMany({
      data: tags.map((t) => ({ contactId: contact.id, tagId: tagIds[t] })),
      skipDuplicates: true,
    });
    // Every third contact gets a lead, spread over the first stages.
    if (i % 3 === 0 && stages.length && !(await prisma.lead.findFirst({ where: { contactId: contact.id } }))) {
      await prisma.lead.create({
        data: { ...scope, contactId: contact.id, title: `${course} admission`, stageId: stages[(i / 3) % Math.min(3, stages.length)].id },
      });
    }
  }

  await prisma.blacklistEntry.upsert({
    where: { tenantId_phone: { tenantId: clientA.id, phone: "919000000011" } },
    update: {},
    create: { tenantId: clientA.id, phone: "919000000011", reason: "Demo: asked not to be contacted" },
  });

  // ── Print ─────────────────────────────────────────────────────────────────
  const rows = [
    ["Client A — Owner", "owner@clienta.test"],
    ["Client A — Admin", "admin@clienta.test"],
    ["Client A — Manager", "manager@clienta.test"],
    ["Client A — Marketing", "marketing@clienta.test"],
    ["Client A — Agent", "agent@clienta.test"],
    ["Reseller N (normal)", "owner@resellern.test"],
    ["Reseller W (white-label)", "owner@resellerw.test"],
    ["Client W1 (under Reseller W)", "owner@clientw1.test"],
  ];
  console.log("\n✅ Demo accounts ready. Password for all:", DEMO_PASSWORD);
  for (const [who, email] of rows) console.log(`   ${who.padEnd(30)} ${email}`);
  console.log("   Super admin: from `npm run seed` → superadmin@whatscrm.app / SuperAdmin@2026");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
