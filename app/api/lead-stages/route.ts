import { NextRequest, NextResponse } from "next/server";
import { LeadStage } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LEAD_STAGES, STAGE_COLORS, type StageColor } from "@/lib/utils";
import { updateLeadStagesSchema } from "@/lib/validators/leadStage";

/**
 * Lead pipeline stage config — the backend source of truth the frontend renders
 * from instead of hardcoding stage arrays.
 *
 * Stages ARE the existing `LeadStage` Prisma enum, exposed as *configuration*
 * (key + label + colour + order + enabled). Per-tenant overrides live in the single
 * nullable `TenantSettings.leadStages` JSON field; when it's null we fall back to the
 * enum defaults from LEAD_STAGES. The Lead model, its enum and every existing Lead API
 * are untouched, so the Add Lead → Select Stage → Created → Pipeline flow is unchanged.
 */

type StoredStage = { key: string; label: string; color: string; order: number; enabled: boolean };

export interface LeadStageDTO {
  key: LeadStage;
  label: string;
  color: StageColor;
  accent: string;
  dot: string;
  order: number;
  enabled: boolean;
}

/** Merge a tenant's stored overrides over the enum defaults. Enum is the source of
 *  truth: unknown stored keys are ignored, missing keys fall back to their default. */
function mergeStages(stored: unknown): LeadStageDTO[] {
  const overrides = new Map<string, StoredStage>();
  if (Array.isArray(stored)) {
    for (const raw of stored) {
      if (raw && typeof raw === "object" && typeof (raw as StoredStage).key === "string") {
        overrides.set((raw as StoredStage).key, raw as StoredStage);
      }
    }
  }

  return LEAD_STAGES.map((def, index) => {
    const o = overrides.get(def.stage);
    const color: StageColor =
      o && typeof o.color === "string" && o.color in STAGE_COLORS ? (o.color as StageColor) : def.color;
    const label = o && typeof o.label === "string" && o.label.trim() ? o.label : def.label;
    const order = o && typeof o.order === "number" && Number.isFinite(o.order) ? o.order : index;
    const enabled = o && typeof o.enabled === "boolean" ? o.enabled : true;
    return {
      key: def.stage,
      label,
      color,
      accent: STAGE_COLORS[color].accent,
      dot: STAGE_COLORS[color].dot,
      order,
      enabled,
    };
  }).sort((a, b) => a.order - b.order);
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId } = session.user;

  try {
    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { leadStages: true },
    });
    return NextResponse.json({ success: true, data: mergeStages(settings?.leadStages) });
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

  // Same RBAC as the rest of tenant settings (see /api/settings).
  if (!["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"].includes(role)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = updateLeadStagesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    }

    // Normalise order to a dense 0..n-1 sequence in the submitted order.
    const leadStages = parsed.data.stages
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((s, index) => ({ key: s.key, label: s.label.trim(), color: s.color, order: index, enabled: s.enabled }));

    await prisma.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, leadStages },
      update: { leadStages },
    });

    return NextResponse.json({ success: true, data: mergeStages(leadStages) });
  } catch (error) {
    console.error("[LEAD-STAGES PATCH]", error);
    return NextResponse.json({ success: false, error: "Failed to update lead stages" }, { status: 500 });
  }
}
