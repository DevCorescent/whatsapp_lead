// ============================================================================
// MODULE : Recording a customer's journey through a flow
// ============================================================================
//
// The conversation row cannot hold this. `activeNodeId` is overwritten at every
// step and `flowVars` is set to null the moment the flow ends — so the answers a
// customer gave were destroyed exactly when they became worth keeping.
//
// A run row is opened when the flow starts and closed when it ends, with the
// path and variables written as it goes. That ordering matters: a customer who
// walks away mid-tree never triggers an "ended" event, so a row written only at
// the end would lose precisely the people you most want to know about. Written
// at the start, an abandoned run is simply one that never got closed.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { FlowVariables, MenuChoice } from "@/lib/chatbot/engine";
import { applyIntentToLead } from "@/lib/leadSignal";
import { INTENT_POINTS, readIntent } from "@/lib/intent";

/** Reserved flow variable holding the open run's id. */
export const RUN_ID_VAR = "__runId";

/** One branch taken, as stored in FlowRun.path. */
export interface FlowPathStep {
  nodeId: string;
  /** The menu's own label, so the path reads as a route rather than ids. */
  node: string;
  /** The option the customer picked. */
  chose: string;
  at: string;
}

/**
 * Variables worth keeping.
 *
 * The engine's own bookkeeping lives under `__`-prefixed keys — the navigation
 * stack, the attempt counter, this run's id — and none of it is anything a sales
 * team asked for. Stripped here rather than at read time so the stored row is
 * already the answer.
 */
export function publicVariables(variables: FlowVariables): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(variables)) {
    if (key.startsWith("__")) continue;
    if (typeof value === "string" && value) out[key] = value;
  }
  return out;
}

export function readRunId(variables: FlowVariables): string | null {
  const raw = variables[RUN_ID_VAR];
  return typeof raw === "string" && raw ? raw : null;
}

/** Open a run as the customer enters a flow. Returns its id, or null on failure. */
export async function startFlowRun(params: {
  tenantId: string;
  businessId: string;
  contactId: string;
  conversationId: string;
  flowId: string;
  flowName: string;
}): Promise<string | null> {
  try {
    const run = await prisma.flowRun.create({
      data: {
        tenantId: params.tenantId,
        businessId: params.businessId,
        contactId: params.contactId,
        conversationId: params.conversationId,
        flowId: params.flowId,
        flowName: params.flowName,
      },
      select: { id: true },
    });
    return run.id;
  } catch (error) {
    // Never fail a customer's conversation to record it.
    console.error("[FLOW RUN] Could not open a run:", error);
    return null;
  }
}

/**
 * Write what happened on one step: the branch taken, the variables so far, and
 * where the customer now stands.
 *
 * `choice` is appended rather than replacing the path, so the row accumulates
 * the whole route. A step with no choice — the flow simply moved on — still
 * updates the variables and the position, because that is what drop-off is
 * measured from.
 */
export async function recordFlowStep(params: {
  runId: string;
  tenantId: string;
  contactId: string;
  choice?: MenuChoice;
  variables: FlowVariables;
  lastNodeId?: string | null;
  lastNodeLabel?: string | null;
}): Promise<void> {
  try {
    const existing = await prisma.flowRun.findUnique({
      where: { id: params.runId },
      select: { path: true },
    });
    if (!existing) return;

    const path = Array.isArray(existing.path) ? (existing.path as unknown[]) : [];
    const next = params.choice
      ? [
          ...path,
          {
            nodeId: params.choice.nodeId,
            node: params.choice.nodeLabel,
            chose: params.choice.label,
            at: new Date().toISOString(),
          } satisfies FlowPathStep,
        ]
      : path;

    await prisma.flowRun.update({
      where: { id: params.runId },
      data: {
        path: next as Prisma.InputJsonValue,
        variables: publicVariables(params.variables) as Prisma.InputJsonValue,
        ...(params.lastNodeId !== undefined && { lastNodeId: params.lastNodeId }),
        ...(params.lastNodeLabel !== undefined && { lastNodeLabel: params.lastNodeLabel }),
      },
    });

    // A menu option can be marked a buying signal, exactly like a FAQ question.
    // Scored here rather than at the end of the run: intent is expressed the
    // moment they choose, and a customer who abandons afterwards has still told
    // you what they wanted.
    if (params.choice) {
      const points = INTENT_POINTS[readIntent(params.choice.intent)];
      if (points > 0) {
        await applyIntentToLead({
          tenantId: params.tenantId,
          contactId: params.contactId,
          reason: `Chose "${params.choice.label}"`,
          points,
          activityType: "IVR_INTEREST",
        });
      }
    }
  } catch (error) {
    console.error("[FLOW RUN] Could not record a step:", error);
  }
}

/** Close a run. `handoff` distinguishes "reached a human" from "reached the end". */
export async function finishFlowRun(params: {
  runId: string;
  variables: FlowVariables;
  handoff: boolean;
}): Promise<void> {
  try {
    await prisma.flowRun.update({
      where: { id: params.runId },
      data: {
        status: params.handoff ? "HANDOFF" : "COMPLETED",
        variables: publicVariables(params.variables) as Prisma.InputJsonValue,
        endedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("[FLOW RUN] Could not close a run:", error);
  }
}
