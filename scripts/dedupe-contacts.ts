// ============================================================================
// Cleanup: normalise stored contact phone numbers and merge the duplicates that
// the old, inconsistent formats let in.
//
//   npx tsx scripts/dedupe-contacts.ts            # dry run — report only (default)
//   npx tsx scripts/dedupe-contacts.ts --apply    # write the changes
//
// Before Phase 1, manual add stored "+919876543210", imports stored "9876543210"
// or "919876543210", and inbound WhatsApp stored "919876543210" — so one person
// could exist up to three times in a business. The app now normalises every entry
// point (lib/import.ts#normalizePhone); this brings existing rows in line.
//
// Per business, contacts whose numbers normalise to the same value are merged:
//   · keeper: not deleted > already normalised > most conversations > oldest;
//   · the keeper's empty fields are filled from the duplicates; opted-out wins
//     (if any copy opted out, the merged contact is opted out);
//   · conversations, leads, tags, campaign history, FAQ interactions and flow runs
//     are moved to the keeper; then the duplicates are deleted.
// A single contact with an un-normalised number just has its number rewritten.
// Numbers that don't normalise to a valid phone are reported and left alone.
//
// Run after the 20260930120000_blacklist_categories migration. Safe to re-run.
// ============================================================================

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { isValidPhone, normalizePhone } from "../lib/import";

const apply = process.argv.includes("--apply");

type Row = {
  id: string;
  businessId: string;
  phone: string;
  name: string;
  email: string | null;
  company: string | null;
  designation: string | null;
  location: string | null;
  source: string | null;
  notes: string | null;
  isBlocked: boolean;
  optedOut: boolean;
  createdAt: Date;
  _count: { conversations: number };
};

function pickKeeper(rows: Row[], normalized: string): Row {
  return [...rows].sort(
    (a, b) =>
      Number(a.isBlocked) - Number(b.isBlocked) ||
      Number(b.phone === normalized) - Number(a.phone === normalized) ||
      b._count.conversations - a._count.conversations ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  )[0];
}

async function main() {
  console.log(`Contact phone cleanup${apply ? "" : " (dry run — nothing will be written; pass --apply to write)"}`);

  const contacts: Row[] = await prisma.contact.findMany({
    select: {
      id: true, businessId: true, phone: true, name: true, email: true, company: true,
      designation: true, location: true, source: true, notes: true, isBlocked: true,
      optedOut: true, createdAt: true, _count: { select: { conversations: true } },
    },
  });

  const groups = new Map<string, Row[]>();
  const invalid: Row[] = [];
  for (const c of contacts) {
    const n = normalizePhone(c.phone);
    if (!isValidPhone(n)) { invalid.push(c); continue; }
    const key = `${c.businessId}|${n}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }

  let rewritten = 0;
  let merged = 0;
  let removed = 0;

  for (const [key, rows] of groups) {
    const normalized = key.split("|")[1];

    if (rows.length === 1) {
      const [only] = rows;
      if (only.phone === normalized) continue;
      rewritten++;
      console.log(`  rewrite  ${only.phone} → ${normalized}  (${only.name})`);
      if (apply) await prisma.contact.update({ where: { id: only.id }, data: { phone: normalized } });
      continue;
    }

    const keeper = pickKeeper(rows, normalized);
    const dupes = rows.filter((r) => r.id !== keeper.id);
    const dupeIds = dupes.map((d) => d.id);
    merged++;
    removed += dupes.length;
    console.log(
      `  merge    ${normalized}: keep "${keeper.name}" (${keeper.phone}), fold in ${dupes.map((d) => `"${d.name}" (${d.phone})`).join(", ")}`,
    );
    if (!apply) continue;

    const fill = <K extends keyof Row>(k: K) => keeper[k] ?? dupes.find((d) => d[k] != null)?.[k] ?? null;

    await prisma.$transaction(async (tx) => {
      await tx.conversation.updateMany({ where: { contactId: { in: dupeIds } }, data: { contactId: keeper.id } });
      await tx.lead.updateMany({ where: { contactId: { in: dupeIds } }, data: { contactId: keeper.id } });
      await tx.campaignContact.updateMany({ where: { contactId: { in: dupeIds } }, data: { contactId: keeper.id } });
      await tx.faqInteraction.updateMany({ where: { contactId: { in: dupeIds } }, data: { contactId: keeper.id } });
      await tx.flowRun.updateMany({ where: { contactId: { in: dupeIds } }, data: { contactId: keeper.id } });

      // Tags: re-create on the keeper (the join's primary key would clash on a plain move).
      const tags = await tx.contactTag.findMany({ where: { contactId: { in: dupeIds } }, select: { tagId: true } });
      if (tags.length) {
        await tx.contactTag.createMany({
          data: [...new Set(tags.map((t) => t.tagId))].map((tagId) => ({ contactId: keeper.id, tagId })),
          skipDuplicates: true,
        });
      }

      // Duplicates go first so the keeper can take the normalised number without a clash.
      await tx.contact.deleteMany({ where: { id: { in: dupeIds } } });
      await tx.contact.update({
        where: { id: keeper.id },
        data: {
          phone: normalized,
          email: fill("email"),
          company: fill("company"),
          designation: fill("designation"),
          location: fill("location"),
          source: fill("source"),
          notes: fill("notes"),
          optedOut: rows.some((r) => r.optedOut),
          isBlocked: rows.every((r) => r.isBlocked),
        },
      });
    });
  }

  for (const c of invalid) console.log(`  skip     "${c.phone}" (${c.name}) — not a valid phone number, left as is`);

  console.log(
    `\n${apply ? "Done" : "Would do"}: ${rewritten} number(s) rewritten, ${merged} duplicate group(s) merged ` +
      `(${removed} contact(s) folded in), ${invalid.length} invalid number(s) skipped.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
