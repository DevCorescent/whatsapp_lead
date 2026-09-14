// ROUTE : /api/admin/cms/sections/[key]  (GET · PUT · DELETE) — SUPER_ADMIN only.
//
//   GET    — the section as the editor needs it: saved content, or the shipped
//            defaults if it has never been saved. Inactive items included.
//   PUT    — replace the section: content, active flag, and every item list in
//            the order given. Validated against lib/cms/sections.ts.
//   DELETE — forget the saved section, so the site goes back to the defaults.
//
// The public site never calls this route; it reads content server-side through
// lib/cms/content.ts. Every write here expires that cache.

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordCmsAudit } from "@/lib/cms/audit";
import { CMS_CACHE_TAG, CMS_PAGE, readStoredSection } from "@/lib/cms/content";
import { CMS_SECTIONS, isSectionKey, type SectionKey } from "@/lib/cms/sections";
import {
  describeIssue,
  sectionPayloadSchema,
  toEditorSection,
  type SectionPayload,
} from "@/lib/cms/store";

type Params = { params: Promise<{ key: string }> };

async function authorize(params: Params["params"]) {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  }
  if (session.user.role !== "SUPER_ADMIN") {
    return { error: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }) };
  }

  const { key } = await params;
  if (!isSectionKey(key)) {
    return { error: NextResponse.json({ success: false, error: "Unknown section" }, { status: 404 }) };
  }
  return { session, key };
}

/**
 * Expire the public content now, not on the next stale-while-revalidate pass.
 *
 * `{ expire: 0 }` is the Route Handler form of an immediate update — an admin who
 * saves and opens the homepage expects to see what they saved. The path call also
 * drops any prerendered marketing page, which carries the footer.
 */
function publish() {
  revalidateTag(CMS_CACHE_TAG, { expire: 0 });
  revalidatePath("/", "layout");
}

class ConflictError extends Error {}

export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await authorize(params);
  if (guard.error) return guard.error;

  try {
    const stored = await readStoredSection(guard.key);
    return NextResponse.json({ success: true, data: toEditorSection(guard.key, stored) });
  } catch (error) {
    console.error(`[CMS] Failed to load section ${guard.key}:`, error);
    return NextResponse.json({ success: false, error: "Could not load this section" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await authorize(params);
  if (guard.error) return guard.error;
  const { session, key } = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = sectionPayloadSchema(key).safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => describeIssue(key, issue));
    return NextResponse.json({ success: false, error: issues[0], issues: issues.slice(0, 10) }, { status: 400 });
  }
  const payload = parsed.data as SectionPayload;

  try {
    await saveSection(key, payload, session.user.id);
  } catch (error) {
    if (error instanceof ConflictError) {
      return NextResponse.json(
        {
          success: false,
          error: "This section was changed by someone else since you opened it. Reload to see their version before saving.",
        },
        { status: 409 },
      );
    }
    console.error(`[CMS] Failed to save section ${key}:`, error);
    return NextResponse.json({ success: false, error: "Could not save this section" }, { status: 500 });
  }

  publish();

  await recordCmsAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "CMS_SECTION_UPDATED",
    sectionKey: key,
    metadata: {
      isActive: payload.isActive,
      items: Object.fromEntries(Object.entries(payload.items).map(([kind, list]) => [kind, list.length])),
    },
  });

  const stored = await readStoredSection(key);
  return NextResponse.json({ success: true, data: toEditorSection(key, stored) });
}

async function saveSection(key: SectionKey, payload: SectionPayload, userId: string) {
  const spec = CMS_SECTIONS[key];
  const itemKinds = spec.collections.map((collection) => collection.kind);

  await prisma.$transaction(
    async (tx) => {
      const existing = await tx.cmsSection.findUnique({
        where: { page_key: { page: CMS_PAGE, key } },
        include: { items: { select: { id: true } } },
      });

      // The editor sends back the updatedAt it loaded — null when it loaded the
      // shipped defaults. Anything else means another save landed in between, and
      // writing now would silently discard it.
      if (payload.expectedUpdatedAt !== undefined) {
        const current = existing ? existing.updatedAt.toISOString() : null;
        if (current !== payload.expectedUpdatedAt) throw new ConflictError();
      }

      const sectionData = {
        isActive: payload.isActive,
        content: payload.content as Prisma.InputJsonValue,
        itemKinds,
        updatedById: userId,
      };

      const section = existing
        ? await tx.cmsSection.update({ where: { id: existing.id }, data: sectionData })
        : await tx.cmsSection.create({ data: { ...sectionData, page: CMS_PAGE, key } });

      // Ids are only honoured for items that already belong to this section. An id
      // from anywhere else is treated as a new item rather than trusted, so a
      // crafted request cannot rewrite another section's rows.
      const own = new Set(existing?.items.map((item) => item.id) ?? []);
      const kept: string[] = [];

      for (const kind of itemKinds) {
        const list = payload.items[kind] ?? [];
        for (const [sortOrder, item] of list.entries()) {
          const data = {
            kind,
            sortOrder,
            isActive: item.isActive,
            data: item.data as Prisma.InputJsonValue,
          };

          if (item.id && own.has(item.id)) {
            await tx.cmsItem.update({ where: { id: item.id }, data });
            kept.push(item.id);
          } else {
            const created = await tx.cmsItem.create({ data: { ...data, sectionId: section.id } });
            kept.push(created.id);
          }
        }
      }

      await tx.cmsItem.deleteMany({ where: { sectionId: section.id, id: { notIn: kept } } });
    },
    { timeout: 20_000 },
  );
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await authorize(params);
  if (guard.error) return guard.error;
  const { session, key } = guard;

  try {
    await prisma.cmsSection.deleteMany({ where: { page: CMS_PAGE, key } });
  } catch (error) {
    console.error(`[CMS] Failed to reset section ${key}:`, error);
    return NextResponse.json({ success: false, error: "Could not restore the defaults" }, { status: 500 });
  }

  publish();

  await recordCmsAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "CMS_SECTION_RESET",
    sectionKey: key,
  });

  return NextResponse.json({ success: true, data: toEditorSection(key, null) });
}
