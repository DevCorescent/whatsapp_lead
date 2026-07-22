// ============================================================================
// MODULE : WhatsApp template approval service
// ============================================================================
//
// The design-time + orchestration logic for the template approval flow, shared
// by the API routes and the background sync cron so they can never disagree.
//
//   - Credential loading (reused everywhere; never duplicated per route).
//   - Meta naming / placeholder validation.
//   - Building Meta's `components` payload from our stored fields.
//   - Mapping Meta's review status onto our local status set.
//   - submit / refresh / sync orchestration (Meta call + DB write).
//
// Credentials come straight from WhatsApp Settings (TenantSettings) — the access
// token is decrypted here and never returned to the client.

import type { MessageTemplate } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveWhatsAppCreds } from "@/lib/business";
import {
  createMessageTemplate,
  getMessageTemplate,
  type WATemplateCreateComponent,
} from "@/lib/whatsapp";

// ─── Statuses ────────────────────────────────────────────────────────────────

export const TEMPLATE_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "DISABLED",
] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

/** Statuses a template may be edited/deleted in — nothing in review or approved. */
export const EDITABLE_STATUSES: string[] = ["DRAFT", "REJECTED"];
export const DELETABLE_STATUSES: string[] = ["DRAFT", "REJECTED", "DISABLED"];

/** Map Meta's review status onto our local status set. */
export function mapMetaStatus(metaStatus: string | undefined): TemplateStatus {
  switch ((metaStatus ?? "").toUpperCase()) {
    case "APPROVED":
      return "APPROVED";
    case "REJECTED":
      return "REJECTED";
    case "DISABLED":
    case "PAUSED":
    case "DELETED":
    case "LIMIT_EXCEEDED":
      return "DISABLED";
    case "PENDING":
    case "IN_APPEAL":
    case "PENDING_DELETION":
    default:
      return "PENDING";
  }
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Meta template-name rules: lowercase letters, digits and underscores only, up
 * to 512 chars, must start with a letter or digit. Returns an error string, or
 * null when valid.
 */
export function validateTemplateName(name: string): string | null {
  if (!name) return "Template name is required";
  if (name.length > 512) return "Template name must be 512 characters or fewer";
  if (!/^[a-z0-9]/.test(name)) return "Template name must start with a lowercase letter or number";
  if (!/^[a-z0-9_]+$/.test(name)) {
    return "Template name may only contain lowercase letters, numbers and underscores (e.g. order_update)";
  }
  return null;
}

/** All `{{n}}` placeholders that appear in a string, in order of appearance. */
export function extractPlaceholders(text: string): number[] {
  const nums: number[] = [];
  const re = /\{\{\s*(\d+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) nums.push(Number(m[1]));
  return nums;
}

/**
 * Meta requires body placeholders to be numeric and contiguous starting at 1
 * ({{1}}, {{2}}, …). Returns an error string, or null when valid.
 */
export function validatePlaceholders(body: string, variables: string[]): string | null {
  const used = [...new Set(extractPlaceholders(body))].sort((a, b) => a - b);
  if (used.length === 0) return null;
  for (let i = 0; i < used.length; i++) {
    if (used[i] !== i + 1) {
      return `Variables must be numbered sequentially from {{1}}. Found a gap near {{${used[i]}}}.`;
    }
  }
  if (variables.length < used.length) {
    return `Provide an example value for each variable ({{1}}…{{${used.length}}}).`;
  }
  return null;
}

// ─── Meta payload builder ────────────────────────────────────────────────────

type TemplateButton = { type: string; text: string; url?: string; phone?: string };

function parseButtons(buttons: MessageTemplate["buttons"]): TemplateButton[] {
  if (!Array.isArray(buttons)) return [];
  return buttons as unknown as TemplateButton[];
}

/** Build Meta's `components` array from our stored template fields. */
export function buildComponents(t: MessageTemplate): WATemplateCreateComponent[] {
  const components: WATemplateCreateComponent[] = [];

  if (t.headerType && t.headerContent) {
    const format = t.headerType.toUpperCase() as "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
    components.push(
      format === "TEXT"
        ? { type: "HEADER", format: "TEXT", text: t.headerContent }
        : { type: "HEADER", format, example: { header_handle: [t.headerContent] } },
    );
  }

  // Body — with per-variable examples when the body uses placeholders.
  const placeholders = [...new Set(extractPlaceholders(t.body))];
  const bodyComponent: WATemplateCreateComponent = { type: "BODY", text: t.body };
  if (placeholders.length > 0) {
    const examples = placeholders.map((_, i) => t.variables[i] || `sample${i + 1}`);
    bodyComponent.example = { body_text: [examples] };
  }
  components.push(bodyComponent);

  if (t.footer) components.push({ type: "FOOTER", text: t.footer });

  const buttons = parseButtons(t.buttons);
  if (buttons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: buttons.map((b) => {
        if (b.type === "URL") return { type: "URL", text: b.text, url: b.url ?? "" };
        if (b.type === "PHONE_NUMBER") return { type: "PHONE_NUMBER", text: b.text, phone_number: b.phone ?? "" };
        return { type: "QUICK_REPLY", text: b.text };
      }),
    });
  }

  return components;
}

// ─── Credentials ─────────────────────────────────────────────────────────────

export class TemplateCredsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateCredsError";
  }
}

/**
 * Load and decrypt a business's WhatsApp Business Account credentials for template
 * operations. Templates live on the WABA, and each business has its own, so creds
 * are keyed by business (falling back to the tenant's legacy settings). Throws a
 * friendly TemplateCredsError when WhatsApp is not fully connected. The access
 * token never leaves the server.
 */
export async function getBusinessTemplateCreds(businessId: string): Promise<{ wabaId: string; apiKey: string }> {
  const creds = await resolveWhatsAppCreds(businessId);

  if (!creds.businessAccountId || !creds.apiKey) {
    throw new TemplateCredsError(
      "Connect WhatsApp first: add your Business Account ID and access token in the business settings.",
    );
  }
  return { wabaId: creds.businessAccountId, apiKey: creds.apiKey };
}

// ─── Orchestration ───────────────────────────────────────────────────────────

/**
 * Submit a template to Meta. Only DRAFT/REJECTED templates may be submitted, and
 * never one that already has a Meta ID and is in review (duplicate-submit guard
 * via the atomic status claim). On success stores the Meta template ID and moves
 * the local status to SUBMITTED.
 */
export async function submitTemplate(id: string, businessId: string): Promise<MessageTemplate> {
  const template = await prisma.messageTemplate.findFirst({ where: { id, businessId } });
  if (!template) throw new TemplateCredsError("Template not found");

  if (!["DRAFT", "REJECTED"].includes(template.status)) {
    throw new TemplateCredsError("Only draft or rejected templates can be submitted.");
  }

  const nameError = validateTemplateName(template.name);
  if (nameError) throw new TemplateCredsError(nameError);
  const placeholderError = validatePlaceholders(template.body, template.variables);
  if (placeholderError) throw new TemplateCredsError(placeholderError);

  const { wabaId, apiKey } = await getBusinessTemplateCreds(businessId);

  // Duplicate-submission guard: atomically move out of the submittable states so
  // two concurrent submits can't both hit Meta.
  const claim = await prisma.messageTemplate.updateMany({
    where: { id, businessId, status: { in: ["DRAFT", "REJECTED"] } },
    data: { status: "SUBMITTED" },
  });
  if (claim.count === 0) {
    throw new TemplateCredsError("Template is already being submitted.");
  }

  try {
    const result = await createMessageTemplate(wabaId, apiKey, {
      name: template.name,
      language: template.language,
      category: template.category as "MARKETING" | "UTILITY" | "AUTHENTICATION",
      components: buildComponents(template),
    });

    return await prisma.messageTemplate.update({
      where: { id },
      data: {
        waTemplateId: result.id,
        status: mapMetaStatus(result.status ?? "PENDING") === "APPROVED" ? "APPROVED" : "SUBMITTED",
        rejectionReason: null,
        lastSyncedAt: new Date(),
      },
    });
  } catch (error) {
    // Roll the status back so the operator can fix and retry the submission.
    const message = error instanceof Error ? error.message : "Submission failed";
    await prisma.messageTemplate.update({
      where: { id },
      data: { status: "DRAFT", rejectionReason: message.slice(0, 1000) },
    });
    throw new TemplateCredsError(message);
  }
}

/** Refresh one template's status from Meta. No-op (returns as-is) if never submitted. */
export async function refreshTemplate(id: string, businessId: string): Promise<MessageTemplate> {
  const template = await prisma.messageTemplate.findFirst({ where: { id, businessId } });
  if (!template) throw new TemplateCredsError("Template not found");
  if (!template.waTemplateId) return template;

  const { apiKey } = await getBusinessTemplateCreds(businessId);
  const meta = await getMessageTemplate(template.waTemplateId, apiKey);
  const status = mapMetaStatus(meta.status);

  return prisma.messageTemplate.update({
    where: { id },
    data: {
      status,
      rejectionReason: status === "REJECTED" ? meta.rejected_reason ?? "Rejected by Meta" : null,
      lastSyncedAt: new Date(),
    },
  });
}

/** Sync every in-review template for one business (used by the manual "Sync all"). */
export async function syncBusinessTemplates(businessId: string): Promise<{ synced: number }> {
  const pending = await prisma.messageTemplate.findMany({
    where: { businessId, status: { in: ["SUBMITTED", "PENDING"] }, waTemplateId: { not: null } },
    select: { id: true },
  });
  let synced = 0;
  for (const { id } of pending) {
    try {
      await refreshTemplate(id, businessId);
      synced++;
    } catch (error) {
      console.error(`[TEMPLATES SYNC] ${id} failed:`, error);
    }
  }
  return { synced };
}

/** Sync every in-review template across all businesses (used by the cron). */
export async function syncAllTemplates(): Promise<{ total: number; synced: number }> {
  const pending = await prisma.messageTemplate.findMany({
    where: { status: { in: ["SUBMITTED", "PENDING"] }, waTemplateId: { not: null } },
    select: { id: true, businessId: true },
    take: 500,
  });
  let synced = 0;
  for (const { id, businessId } of pending) {
    try {
      await refreshTemplate(id, businessId);
      synced++;
    } catch (error) {
      console.error(`[TEMPLATES CRON] ${id} failed:`, error);
    }
  }
  return { total: pending.length, synced };
}
