// ─────────────────────────────────────────────────────────────────────────────
// Decision rules for multi-number WhatsApp.
//
// Pure functions only — no Prisma, no fetch. Every choice that decides which
// WhatsApp number a message is received on or sent from is made here, so the
// rules can be unit-tested (tests/whatsapp-integrations.test.ts) and the database
// code in lib/whatsappIntegrations.ts and lib/business.ts only has to load rows
// and act on the answer.
// ─────────────────────────────────────────────────────────────────────────────

/** The columns the rules look at. A Prisma WhatsAppIntegration row satisfies this. */
export interface IntegrationCandidate {
  id: string;
  tenantId: string;
  businessId: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
}

const byAge = (a: IntegrationCandidate, b: IntegrationCandidate) =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);

/**
 * The number a business sends from when nothing more specific is known
 * (campaigns, templates, a thread with no number of its own).
 *
 * The flagged default wins; failing that the oldest active number, so a business
 * whose default was just disconnected still has a deterministic sender. Inactive
 * rows are never chosen.
 */
export function selectDefaultIntegration<T extends IntegrationCandidate>(
  integrations: T[],
): T | null {
  const active = integrations.filter((i) => i.isActive);
  return active.find((i) => i.isDefault) ?? [...active].sort(byAge)[0] ?? null;
}

/** Outcome of asking to use one specific integration for a business. */
export type OwnedIntegration<T> =
  | { ok: true; integration: T }
  | { ok: false; reason: "not-found" | "inactive" };

/**
 * Check that an integration may be used on behalf of a business.
 *
 * A row belonging to any other business — including one in another tenant, or one
 * that was re-connected elsewhere after this business disconnected it — is reported
 * exactly like a missing row. The caller must then refuse, never substitute another
 * number: a customer who wrote to number A must not get an answer from number B.
 */
export function checkIntegrationOwnership<T extends IntegrationCandidate>(
  integration: T | null | undefined,
  scope: { tenantId?: string; businessId: string },
): OwnedIntegration<T> {
  if (!integration) return { ok: false, reason: "not-found" };
  if (integration.businessId !== scope.businessId) return { ok: false, reason: "not-found" };
  if (scope.tenantId && integration.tenantId !== scope.tenantId) {
    return { ok: false, reason: "not-found" };
  }
  if (!integration.isActive) return { ok: false, reason: "inactive" };
  return { ok: true, integration };
}

/** How an inbound webhook for one phone_number_id should be routed. */
export type InboundRoute =
  | { kind: "integration"; integrationId: string; tenantId: string; businessId: string }
  | { kind: "disconnected" }
  | { kind: "legacy" };

/**
 * Route an inbound `phone_number_id`.
 *
 * An active integration is authoritative. A disconnected one is a deliberate
 * "stop receiving on this number" and must not fall through to the legacy lookup,
 * which could otherwise re-attach the number to a business on the next message.
 * Only a number with no integration row at all is handed to the legacy path.
 */
export function routeInbound(
  integration:
    | (Pick<IntegrationCandidate, "id" | "tenantId" | "businessId" | "isActive"> & {
        businessTenantId: string;
      })
    | null,
): InboundRoute {
  if (!integration) return { kind: "legacy" };
  if (!integration.isActive) return { kind: "disconnected" };
  // A row whose business sits in another tenant is corrupt; never route on it.
  if (integration.businessTenantId !== integration.tenantId) return { kind: "disconnected" };
  return {
    kind: "integration",
    integrationId: integration.id,
    tenantId: integration.tenantId,
    businessId: integration.businessId,
  };
}

/**
 * Which integration becomes default after `removedId` is disconnected.
 *
 * Only matters when the removed row was the default; the oldest remaining active
 * number is promoted, or nothing when none remains.
 */
export function planDefaultAfterDisconnect<T extends IntegrationCandidate>(
  integrations: T[],
  removedId: string,
): { promoteId: string | null } {
  const removed = integrations.find((i) => i.id === removedId);
  if (!removed?.isDefault) return { promoteId: null };
  const next = integrations
    .filter((i) => i.id !== removedId && i.isActive)
    .sort(byAge)[0];
  return { promoteId: next?.id ?? null };
}

/** Whether a newly connected (or reactivated) number should become the default. */
export function shouldBecomeDefault(
  otherIntegrationsOfBusiness: Pick<IntegrationCandidate, "isActive" | "isDefault">[],
): boolean {
  return !otherIntegrationsOfBusiness.some((i) => i.isActive && i.isDefault);
}

/** Outcome of trying to attach a phone number to a business. */
export type ClaimDecision =
  | { action: "create" }
  | { action: "update"; integrationId: string }
  | { action: "reassign"; integrationId: string }
  | { action: "conflict"; sameTenant: boolean };

/**
 * Decide what connecting `phoneNumberId` to `businessId` means, given who holds it now.
 *
 * - already this business's row → update it in place (reconnect / token refresh)
 * - an active row elsewhere, or a legacy Business column elsewhere → conflict (409)
 * - a disconnected row elsewhere → take it over; the old owner's threads keep
 *   pointing at it and are refused by checkIntegrationOwnership, never re-routed
 */
export function decideClaim(input: {
  tenantId: string;
  businessId: string;
  existing: Pick<IntegrationCandidate, "id" | "tenantId" | "businessId" | "isActive"> | null;
  legacyOwner: { businessId: string; tenantId: string } | null;
}): ClaimDecision {
  const { tenantId, businessId, existing, legacyOwner } = input;

  if (legacyOwner && legacyOwner.businessId !== businessId) {
    return { action: "conflict", sameTenant: legacyOwner.tenantId === tenantId };
  }
  if (!existing) return { action: "create" };
  if (existing.businessId === businessId) return { action: "update", integrationId: existing.id };
  if (existing.isActive) return { action: "conflict", sameTenant: existing.tenantId === tenantId };
  return { action: "reassign", integrationId: existing.id };
}
