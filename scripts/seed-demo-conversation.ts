// Seeds a demo conversation (contact + inbound customer question) under the demo
// tenant so you can test the AI Suggest / RAG flow in the inbox.
// Run under Node LTS with: npx tsx scripts/seed-demo-conversation.ts
//
// Idempotent: safe to run multiple times — it resets the demo thread's messages.

import "dotenv/config";
import { prisma } from "../lib/prisma";

const CONTACT_PHONE = "+919000000001";
const QUESTION =
  "Hi! I bought wireless earbuds a few days ago. How many days do I have to return them, and is cash on delivery available?";

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "demo-workspace" } });
  if (!tenant) throw new Error("Demo tenant not found — run `npm run db:seed` first.");

  const businessId = `biz_${tenant.id}`;

  const contact = await prisma.contact.upsert({
    where: { phone_businessId: { phone: CONTACT_PHONE, businessId } },
    update: {},
    create: {
      tenantId: tenant.id,
      businessId,
      name: "Riya Sharma",
      phone: CONTACT_PHONE,
      email: "riya@example.com",
      source: "WhatsApp",
    },
  });

  let conversation = await prisma.conversation.findFirst({
    where: { tenantId: tenant.id, contactId: contact.id },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { tenantId: tenant.id, businessId, contactId: contact.id, status: "OPEN", channel: "WHATSAPP" },
    });
  }

  // Reset messages so re-running gives a clean single inbound question.
  await prisma.message.deleteMany({ where: { conversationId: conversation.id } });
  await prisma.message.create({
    data: {
      tenantId: tenant.id,
      conversationId: conversation.id,
      type: "TEXT",
      direction: "INBOUND",
      content: QUESTION,
      status: "DELIVERED",
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), lastMessagePreview: QUESTION.slice(0, 80), unreadCount: 1 },
  });

  console.log("✅ Demo conversation ready.");
  console.log(`   Contact: ${contact.name} (${contact.phone})`);
  console.log(`   Question: "${QUESTION}"`);
  console.log("\n👉 Open the Inbox, pick Riya Sharma's thread, and click the ✨ AI Suggest button.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
