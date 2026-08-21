// ============================================================================
// MODULE : One multi-document FAQ set
// ROUTE  : /api/knowledge/faq-sets/[id]  (GET · PUT · DELETE)
//
// ACCESS : Signed-in members of the tenant, scoped to the active business.
// ============================================================================
//
// PUT is the no-model half of editing: rename the set, change which documents it
// draws on, or store the question list as the user rewrote it. Answering is a
// separate route because it costs a model call and this must not.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import { toJsonFaqs, toJsonStyle } from "@/lib/knowledgeFaq";
import { faqSetDocs, loadFaqSet, presentFaqSet } from "@/lib/knowledgeFaqSet";
import { updateFaqSetSchema } from "@/lib/validators/knowledgeFaq";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const found = await loadFaqSet(scope.tenantId, scope.businessId, id);
    if (!found) return NextResponse.json({ success: false, error: "FAQ set not found" }, { status: 404 });

    return NextResponse.json({ success: true, data: found.view });
  } catch (error) {
    console.error("[FAQ SET GET]", error);
    return NextResponse.json({ success: false, error: "Failed to load the FAQ set" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId } = scope;

  try {
    const { id } = await params;
    const found = await loadFaqSet(tenantId, businessId, id);
    if (!found) return NextResponse.json({ success: false, error: "FAQ set not found" }, { status: 404 });

    const parsed = updateFaqSetSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { name, docIds, faqs, style } = parsed.data;

    // Re-queried under the caller's scope for the same reason as on create:
    // these ids decide which documents get read, and they arrive from a browser.
    let nextDocs = found.docs;
    if (docIds) {
      nextDocs = await faqSetDocs(tenantId, businessId, docIds);
      if (nextDocs.length !== new Set(docIds).size) {
        return NextResponse.json(
          { success: false, error: "One or more of those documents could not be found" },
          { status: 404 },
        );
      }
    }

    const updated = await prisma.knowledgeFaqSet.update({
      where: { id: found.set.id },
      data: {
        ...(name !== undefined && { name }),
        ...(docIds !== undefined && { docIds: nextDocs.map((d) => d.id) }),
        ...(faqs !== undefined && { faqs: toJsonFaqs(faqs) }),
        ...(style !== undefined && { style: toJsonStyle(style) }),
        // Cleared on any successful save. A stale failure message pinned under a
        // set the user has since fixed reads as a live problem, which is the bug
        // the per-document cards have today.
        error: null,
      },
    });

    return NextResponse.json({
      success: true,
      data: presentFaqSet(updated, new Map(nextDocs.map((d) => [d.id, d]))),
    });
  } catch (error) {
    console.error("[FAQ SET PUT]", error);
    return NextResponse.json({ success: false, error: "Failed to save the FAQ set" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const found = await loadFaqSet(scope.tenantId, scope.businessId, id);
    if (!found) return NextResponse.json({ success: false, error: "FAQ set not found" }, { status: 404 });

    // Only the question list goes. The documents it drew on are untouched — a set
    // is a saved view over them, not a container that owns them.
    await prisma.knowledgeFaqSet.delete({ where: { id: found.set.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[FAQ SET DELETE]", error);
    return NextResponse.json({ success: false, error: "Failed to delete the FAQ set" }, { status: 500 });
  }
}
