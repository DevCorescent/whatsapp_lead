// ============================================================================
// OWNER  : Gauransh
// MODULE : Lead Pipeline Stages
// ROUTE  : /api/lead-stages
//
// METHODS
// GET    - List the tenant's pipeline stages (provisioning defaults on first use).
// PATCH  - Save the tenant's entire desired stage list: create, rename, recolour,
//          reorder, enable/disable, set-default and delete, in one atomic diff.
//
// ACCESS
// GET    - Authenticated. Any role — everyone renders the pipeline from these.
// PATCH  - Authenticated + admin (SUPER_ADMIN | TENANT_OWNER | ADMIN), matching the
//          rest of tenant settings. Scoped to session.user.tenantId throughout.
// ============================================================================
//
// The dynamic replacement for the former enum + JSON override: stages are real
// `PipelineStage` rows and every Lead references one. PATCH takes the whole desired
// list and reconciles it against what exists — a single endpoint that covers all six
// admin capabilities without fragmenting into per-operation routes.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePipelineStages, toStageDTO } from "@/lib/pipelineStages";
import { updatePipelineStagesSchema } from "@/lib/validators/leadStage";

/** Roles allowed to manage stages — same allowlist as the rest of tenant settings. */
const STAGE_ADMIN_ROLES = ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"];

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stages = await ensurePipelineStages(session.user.tenantId);
    return NextResponse.json({ success: true, data: stages.map(toStageDTO) });
  } catch (error) {
    console.error("[LEAD-STAGES GET]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch lead stages" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { tenantId, role } = session.user;
  if (!STAGE_ADMIN_ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = updatePipelineStagesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const desired = parsed.data.stages;

    // Only stages this tenant owns may be targeted by id — a foreign or stale id is a bad
    // request, never a silent no-op that could touch another workspace's row.
    const existing = await prisma.pipelineStage.findMany({ where: { tenantId } });
    const existingById = new Map(existing.map((s) => [s.id, s]));
    for (const s of desired) {
      if (s.id && !existingById.has(s.id)) {
        return NextResponse.json({ success: false, error: "Unknown stage" }, { status: 400 });
      }
    }

    // Stages present before but absent now are deletions. A stage that still holds leads
    // must not be deleted — reassign or disable it first — so those are refused loudly
    // rather than cascading into lost leads (the FK is Restrict for the same reason).
    const keepIds = new Set(desired.filter((s) => s.id).map((s) => s.id as string));
    const toDelete = existing.filter((s) => !keepIds.has(s.id));
    if (toDelete.length > 0) {
      const counts = await prisma.lead.groupBy({
        by: ["stageId"],
        where: { tenantId, stageId: { in: toDelete.map((s) => s.id) } },
        _count: { _all: true },
      });
      const blocked = counts.find((c) => c._count._all > 0);
      if (blocked) {
        const name = existingById.get(blocked.stageId)?.name ?? "This stage";
        return NextResponse.json(
          {
            success: false,
            error: `"${name}" still has ${blocked._count._all} lead(s). Reassign or disable it before deleting.`,
          },
          { status: 409 },
        );
      }
    }

    // Exactly one default. Validation caps it at ≤1 and requires it be enabled; if the admin
    // set none, the first enabled stage becomes the default so lead creation always has a target.
    let defaultIndex = desired.findIndex((s) => s.isDefault);
    if (defaultIndex === -1) defaultIndex = desired.findIndex((s) => s.enabled);

    await prisma.$transaction(async (tx) => {
      if (toDelete.length > 0) {
        await tx.pipelineStage.deleteMany({
          where: { id: { in: toDelete.map((s) => s.id) }, tenantId },
        });
      }

      for (let i = 0; i < desired.length; i++) {
        const s = desired[i];
        const data = {
          name: s.name.trim(),
          color: s.color,
          order: i,
          enabled: s.enabled,
          isDefault: i === defaultIndex,
          outcome: s.outcome,
        };
        if (s.id) {
          await tx.pipelineStage.update({ where: { id: s.id }, data });
        } else {
          await tx.pipelineStage.create({ data: { tenantId, ...data } });
        }
      }
    });

    const fresh = await prisma.pipelineStage.findMany({ where: { tenantId }, orderBy: { order: "asc" } });
    return NextResponse.json({ success: true, data: fresh.map(toStageDTO) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ success: false, error: "Stage names must be unique" }, { status: 409 });
    }
    console.error("[LEAD-STAGES PATCH]", error);
    return NextResponse.json({ success: false, error: "Failed to update lead stages" }, { status: 500 });
  }
}
