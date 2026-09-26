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
  listMessageTemplates,
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
 * Detect whether a template body uses named ({{snake_case}}) or positional ({{1}}) params.
 * Positional takes precedence when both patterns appear.
 */
export function detectParameterFormat(text: string): "POSITIONAL" | "NAMED" {
  if (/\{\{\d+\}\}/.test(text)) return "POSITIONAL";
  if (/\{\{[a-z_][a-z0-9_]*\}\}/.test(text)) return "NAMED";
  return "POSITIONAL";
}

/** Extract named param identifiers from body text in order of appearance, deduped. */
export function extractNamedParams(text: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const re = /\{\{([a-z_][a-z0-9_]*)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); names.push(m[1]); }
  }
  return names;
}

/**
 * Meta requires body placeholders to be numeric and contiguous starting at 1
 * ({{1}}, {{2}}, …) for positional, or lowercase snake_case for named.
 * Returns an error string, or null when valid.
 */
export function validatePlaceholders(body: string, variables: string[]): string | null {
  const fmt = detectParameterFormat(body);
  if (fmt === "NAMED") {
    const names = extractNamedParams(body);
    if (names.length === 0) return null;
    if (variables.length < names.length) {
      return `Provide an example value for each variable (${names.map((n) => `{{${n}}}`).join(", ")}).`;
    }
    return null;
  }
  // Positional
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

type TemplateButton = {
  type: string;
  text: string;
  url?: string;
  phone?: string;
  urlType?: "STATIC" | "DYNAMIC";
  urlExample?: string;
  offerCode?: string;
};

function parseButtons(buttons: MessageTemplate["buttons"]): TemplateButton[] {
  if (!Array.isArray(buttons)) return [];
  return buttons as unknown as TemplateButton[];
}

/** Build Meta's `components` array from our stored template fields. */
export function buildComponents(t: MessageTemplate): WATemplateCreateComponent[] {
  const components: WATemplateCreateComponent[] = [];

  if (t.headerType) {
    const format = t.headerType.toUpperCase() as "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
    if (format === "TEXT" && t.headerContent) {
      const hasVar = /\{\{\s*\d+\s*\}\}/.test(t.headerContent);
      const headerComp: WATemplateCreateComponent = { type: "HEADER", format: "TEXT", text: t.headerContent };
      if (hasVar) {
        const hv = (t as MessageTemplate & { headerVariables?: string[] }).headerVariables ?? [];
        headerComp.example = { header_text: [hv[0] || "Example"] };
      }
      components.push(headerComp);
    } else if (format !== "TEXT" && t.headerContent) {
      // IMAGE/DOCUMENT/VIDEO — headerContent is either:
      //   • a Meta media ID (from the upload endpoint) → use as header_handle
      //   • a public https:// URL → skip the example (Meta requires a proper handle)
      //     URLs passed as header_handle cause "Invalid parameter" — omit rather than fail.
      const isUrl = t.headerContent.startsWith("http");
      components.push({
        type: "HEADER",
        format,
        ...(isUrl ? {} : { example: { header_handle: [t.headerContent] } }),
      });
    }
  }

  // Body — with per-variable examples when the body uses placeholders.
  const bodyComponent: WATemplateCreateComponent = { type: "BODY", text: t.body };
  const fmt = detectParameterFormat(t.body);
  if (fmt === "NAMED") {
    const namedParams = extractNamedParams(t.body);
    if (namedParams.length > 0) {
      bodyComponent.example = {
        body_text_named_params: namedParams.map((name, i) => ({
          param_name: name,
          example: t.variables[i] || `sample_${name}`,
        })),
      };
    }
  } else {
    const placeholders = [...new Set(extractPlaceholders(t.body))];
    if (placeholders.length > 0) {
      const examples = placeholders.map((_, i) => t.variables[i] || `sample${i + 1}`);
      bodyComponent.example = { body_text: [examples] };
    }
  }
  components.push(bodyComponent);

  if (t.footer) components.push({ type: "FOOTER", text: t.footer });

  const buttons = parseButtons(t.buttons);
  if (buttons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: buttons.map((b) => {
        if (b.type === "URL") {
          return {
            type: "URL" as const,
            text: b.text,
            url: b.url ?? "",
            ...(b.urlType === "DYNAMIC" && b.urlExample ? { example: [b.urlExample] } : {}),
          };
        }
        if (b.type === "PHONE_NUMBER") return { type: "PHONE_NUMBER" as const, text: b.text, phone_number: b.phone ?? "" };
        if (b.type === "OTP") return { type: "OTP" as const, otp_type: "COPY_CODE" as const, text: b.text };
        if (b.type === "COPY_CODE") return { type: "COPY_CODE" as const, example: [b.offerCode || "DISCOUNT20"] };
        if (b.type === "VOICE_CALL") return { type: "VOICE_CALL" as const, text: b.text, phone_number: b.phone ?? "" };
        return { type: "QUICK_REPLY" as const, text: b.text };
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
    const isNamed = detectParameterFormat(template.body) === "NAMED";
    const result = await createMessageTemplate(wabaId, apiKey, {
      name: template.name,
      language: template.language,
      category: template.category as "MARKETING" | "UTILITY" | "AUTHENTICATION",
      components: buildComponents(template),
      // Only include parameter_format for named templates — Meta rejects "positional" as unexpected.
      ...(isNamed ? { parameter_format: "named" as const } : {}),
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

  const { wabaId, apiKey } = await getBusinessTemplateCreds(businessId);
  const meta = await getMessageTemplate(wabaId, apiKey, template.waTemplateId);
  const status = mapMetaStatus(meta.status);

  return prisma.messageTemplate.update({
    where: { id },
    data: {
      status,
      rejectionReason: status === "REJECTED" ? meta.rejection_reason ?? "Rejected by Meta" : null,
      lastSyncedAt: new Date(),
    },
  });
}

/**
 * Pull all templates from the Meta WABA and upsert them into the local DB.
 *
 * Templates that exist locally (matched by waTemplateId) have their status and
 * rejection reason refreshed. Templates Meta knows about but we don't yet have
 * are created as APPROVED/PENDING/etc. records so the operator can see everything.
 * Drafts that were never submitted to Meta are left untouched.
 *
 * Returns counts of created and updated records.
 */
export async function importTemplatesFromMeta(
  businessId: string,
  tenantId: string,
): Promise<{ created: number; updated: number }> {
  const { wabaId, apiKey } = await getBusinessTemplateCreds(businessId);
  const metaTemplates = await listMessageTemplates(wabaId, apiKey);

  let created = 0;
  let updated = 0;

  for (const mt of metaTemplates) {
    const status = mapMetaStatus(mt.status);

    // Derive body from Meta's BODY component, fall back to empty string.
    const bodyComp = mt.components?.find((c) => c.type === "BODY");
    const body = bodyComp?.text ?? "";

    // Header
    const headerComp = mt.components?.find((c) => c.type === "HEADER");
    const headerType = headerComp?.format?.toUpperCase() as
      | "TEXT"
      | "IMAGE"
      | "VIDEO"
      | "DOCUMENT"
      | undefined;
    const headerContent =
      headerComp?.format === "TEXT" ? (headerComp.text ?? undefined) : undefined;

    // Footer
    const footerComp = mt.components?.find((c) => c.type === "FOOTER");
    const footer = footerComp?.text ?? undefined;

    // Buttons
    const buttonComp = mt.components?.find((c) => c.type === "BUTTONS");
    const buttons = buttonComp?.buttons?.map((b) => ({
      type: b.type as "QUICK_REPLY" | "URL" | "PHONE_NUMBER",
      text: b.text,
      ...(b.url ? { url: b.url } : {}),
      ...(b.phone_number ? { phone: b.phone_number } : {}),
    }));

    const existing = await prisma.messageTemplate.findFirst({
      where: { businessId, waTemplateId: mt.id },
    });

    // Auto-detect example values for variables from the body text
    const paramFmt = mt.parameter_format === "named" ? "NAMED"
      : detectParameterFormat(body);
    const importedVariables = paramFmt === "NAMED"
      ? extractNamedParams(body).map((name) => `{{${name}}}`) // placeholder examples
      : [];

    if (existing) {
      await prisma.messageTemplate.update({
        where: { id: existing.id },
        data: {
          status,
          rejectionReason: status === "REJECTED" ? mt.rejection_reason ?? null : null,
          lastSyncedAt: new Date(),
          // Refresh body and variables if they were empty (e.g. imported before this feature)
          ...(existing.variables.length === 0 && importedVariables.length > 0
            ? { variables: importedVariables }
            : {}),
        },
      });
      updated++;
    } else {
      // Only import if we don't already have a local record with the same name+language.
      const duplicate = await prisma.messageTemplate.findFirst({
        where: { businessId, name: mt.name, language: mt.language },
      });
      if (!duplicate) {
        await prisma.messageTemplate.create({
          data: {
            tenantId,
            businessId,
            name: mt.name,
            category: mt.category as "MARKETING" | "UTILITY" | "AUTHENTICATION",
            language: mt.language,
            body,
            status,
            waTemplateId: mt.id,
            variables: importedVariables,
            rejectionReason: status === "REJECTED" ? mt.rejection_reason ?? null : null,
            lastSyncedAt: new Date(),
            ...(headerType ? { headerType } : {}),
            ...(headerContent ? { headerContent } : {}),
            ...(footer ? { footer } : {}),
            ...(buttons?.length ? { buttons } : {}),
          },
        });
        created++;
      }
    }
  }

  // Mark local templates as DISABLED if Meta no longer has them
  const metaIds = new Set(metaTemplates.map((mt) => mt.id).filter(Boolean));
  const localSubmitted = await prisma.messageTemplate.findMany({
    where: { businessId, waTemplateId: { not: null }, status: { notIn: ["DRAFT", "DISABLED"] } },
    select: { id: true, waTemplateId: true },
  });
  for (const local of localSubmitted) {
    if (local.waTemplateId && !metaIds.has(local.waTemplateId)) {
      await prisma.messageTemplate.update({
        where: { id: local.id },
        data: { status: "DISABLED", lastSyncedAt: new Date() },
      });
      updated++;
    }
  }

  return { created, updated };
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
