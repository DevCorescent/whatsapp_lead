// ============================================================================
// MODULE : WhatsApp integrations (one row per connected number)
// ============================================================================
//
// Every write that changes which numbers a business owns goes through here:
// connecting (Embedded Signup), mirroring legacy hand-entered credentials, and
// disconnecting. Reads for sending live in lib/business.ts (resolveWhatsAppCreds),
// reads for routing in lib/inbound.ts (resolveTenant); both apply the rules in
// lib/whatsappIntegrationRules.ts.
//
// Concurrency. Two guarantees are needed and they are held in two different ways:
//
//   · A phone_number_id belongs to one row — the `phoneNumberId` unique index.
//     Two businesses racing to claim the same number cannot both commit; the loser
//     surfaces as P2002 and is reported as a 409.
//
//   · A business has at most one default — every write that can change a default
//     first takes `SELECT … FOR UPDATE` on the business row, so writes for the
//     same business run one after another and each sees the previous one's result.
//     The partial unique index in the migration backs this up at the database level.

import { Prisma, type WhatsAppIntegration } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret, isMetaAccessToken } from "@/lib/crypto";
import { invalidateCredsCache, invalidateTenantCache } from "@/lib/cache";
import { MetaApiError } from "@/lib/whatsapp";
import { unsubscribeAppFromWaba } from "@/lib/whatsappEmbeddedSignup";
import {
  decideClaim,
  planDefaultAfterDisconnect,
  shouldBecomeDefault,
} from "@/lib/whatsappIntegrationRules";

/** Columns that are safe to send to the browser. Never includes a token or secret. */
export const PUBLIC_INTEGRATION_SELECT = {
  id: true,
  businessId: true,
  displayName: true,
  phoneNumber: true,
  phoneNumberId: true,
  whatsappBusinessId: true,
  qualityRating: true,
  codeVerificationStatus: true,
  isActive: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WhatsAppIntegrationSelect;

export type PublicIntegration = Prisma.WhatsAppIntegrationGetPayload<{
  select: typeof PUBLIC_INTEGRATION_SELECT;
}>;

/** True for Prisma's unique-constraint violation. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

/**
 * Serialise every default-affecting write for one business.
 *
 * Held until the surrounding transaction commits. Two tabs clicking "Connect" for
 * the same business therefore run in sequence, and the second sees the default the
 * first one set instead of also setting one.
 */
async function lockBusiness(tx: Prisma.TransactionClient, businessId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "businesses" WHERE "id" = ${businessId} FOR UPDATE`;
}

/** The active default integration of a business, or its oldest active one. */
export async function findDefaultIntegration(
  businessId: string,
): Promise<WhatsAppIntegration | null> {
  return prisma.whatsAppIntegration.findFirst({
    where: { businessId, isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }, { id: "asc" }],
  });
}

// ─── Claim (connect / reconnect / legacy mirror) ─────────────────────────────

export interface ClaimIntegrationInput {
  tenantId: string;
  businessId: string;
  phoneNumberId: string;
  whatsappBusinessId: string;
  /** Already encrypted with encryptSecret(). */
  encryptedToken: string;
  displayName?: string | null;
  phoneNumber?: string | null;
  qualityRating?: string | null;
  codeVerificationStatus?: string | null;
  verifyToken?: string | null;
  appSecret?: string | null;
  /**
   * The row mirrors the business's legacy (hand-entered) number. On create, the
   * business's threads that have no number yet are attached to it — before
   * multi-number support every thread of a business was on that one number.
   */
  fromLegacy?: boolean;
}

export type ClaimIntegrationResult =
  | { ok: true; integration: WhatsAppIntegration; created: boolean }
  | { ok: false; reason: "conflict"; sameTenant: boolean; ownerBusinessName: string | null };

/**
 * Attach a phone number to a business, creating, refreshing or taking over its row.
 *
 * Idempotent for the same business: reconnecting a number updates the token and
 * Meta's details in place and keeps the row id, so every thread that used the
 * number keeps working. See decideClaim() for the cross-business rules.
 */
export async function claimIntegration(
  input: ClaimIntegrationInput,
): Promise<ClaimIntegrationResult> {
  const details = {
    displayName: input.displayName ?? null,
    phoneNumber: input.phoneNumber ?? null,
    whatsappBusinessId: input.whatsappBusinessId,
    accessToken: input.encryptedToken,
    qualityRating: input.qualityRating ?? null,
    codeVerificationStatus: input.codeVerificationStatus ?? null,
    ...(input.verifyToken !== undefined && { verifyToken: input.verifyToken }),
    ...(input.appSecret !== undefined && { appSecret: input.appSecret }),
    isActive: true,
  };

  try {
    return await prisma.$transaction(async (tx) => {
      await lockBusiness(tx, input.businessId);

      const [existing, legacyOwner] = await Promise.all([
        tx.whatsAppIntegration.findUnique({
          where: { phoneNumberId: input.phoneNumberId },
          include: { business: { select: { name: true } } },
        }),
        tx.business.findFirst({
          where: { whatsappPhoneNumberId: input.phoneNumberId, NOT: { id: input.businessId } },
          select: { id: true, tenantId: true, name: true },
        }),
      ]);

      const decision = decideClaim({
        tenantId: input.tenantId,
        businessId: input.businessId,
        existing,
        legacyOwner: legacyOwner
          ? { businessId: legacyOwner.id, tenantId: legacyOwner.tenantId }
          : null,
      });

      if (decision.action === "conflict") {
        return {
          ok: false as const,
          reason: "conflict" as const,
          sameTenant: decision.sameTenant,
          // Only ever named to members of the same tenant.
          // decideClaim checks the legacy owner first, so name whichever one it refused on.
          ownerBusinessName: decision.sameTenant
            ? (legacyOwner?.name ?? existing?.business.name ?? null)
            : null,
        };
      }

      const others = await tx.whatsAppIntegration.findMany({
        where: {
          businessId: input.businessId,
          ...(decision.action !== "create" && { NOT: { id: decision.integrationId } }),
        },
        select: { isActive: true, isDefault: true },
      });
      const becomeDefault = shouldBecomeDefault(others);

      let integration: WhatsAppIntegration;
      let created = false;

      if (decision.action === "create") {
        integration = await tx.whatsAppIntegration.create({
          data: {
            tenantId: input.tenantId,
            businessId: input.businessId,
            phoneNumberId: input.phoneNumberId,
            ...details,
            isDefault: becomeDefault,
          },
        });
        created = true;
        if (input.fromLegacy) {
          await tx.conversation.updateMany({
            where: { businessId: input.businessId, whatsappIntegrationId: null },
            data: { whatsappIntegrationId: integration.id },
          });
        }
      } else if (decision.action === "update") {
        integration = await tx.whatsAppIntegration.update({
          where: { id: decision.integrationId },
          data: {
            ...details,
            // A live default stays default; a reactivated row only becomes default
            // when the business has none.
            isDefault: existing?.isActive && existing.isDefault ? true : becomeDefault,
          },
        });
      } else {
        // Take over a number another business disconnected. Its old threads keep
        // pointing at this row and are refused by the ownership check, never
        // answered from here.
        integration = await tx.whatsAppIntegration.update({
          where: { id: decision.integrationId },
          data: {
            tenantId: input.tenantId,
            businessId: input.businessId,
            ...details,
            isDefault: becomeDefault,
          },
        });
      }

      // Keep the legacy columns honest when they describe this same number, so the
      // fallback path never sends with a token that has just been replaced.
      await tx.business.updateMany({
        where: { id: input.businessId, whatsappPhoneNumberId: input.phoneNumberId },
        data: {
          whatsappAccessToken: input.encryptedToken,
          whatsappBusinessId: input.whatsappBusinessId,
        },
      });

      return { ok: true as const, integration, created };
    });
  } catch (error) {
    // Another business committed the same phone_number_id between our read and write.
    if (isUniqueViolation(error)) {
      return { ok: false, reason: "conflict", sameTenant: false, ownerBusinessName: null };
    }
    throw error;
  } finally {
    await invalidateCredsCache(input.businessId);
    await invalidateTenantCache(input.phoneNumberId);
  }
}

// ─── Legacy mirror ───────────────────────────────────────────────────────────

export type LegacySyncResult =
  | { status: "synced"; integrationId: string; created: boolean }
  | { status: "skipped"; reason: "no-business" | "incomplete" | "invalid-token" | "conflict" };

/**
 * Mirror a business's hand-entered legacy credentials into a WhatsAppIntegration.
 *
 * Called after anything writes the legacy Business.whatsapp* columns (the
 * Businesses page, the Settings → WhatsApp manual form), before the first
 * Embedded Signup connection, and by the backfill script. It keeps the legacy
 * number visible in the multi-number list and routed through the same path as
 * every other number, so manual edits are never shadowed by a stale copy.
 *
 * Incomplete or non-Meta credentials are never mirrored — a row that cannot send
 * would only show "Connected" over a number that does not work.
 *
 * @param replacedPhoneNumberId - The legacy number before this edit. When the edit
 *   replaced it with a different number, the old row is disconnected, matching what
 *   replacing the number in the form has always meant.
 */
export async function syncLegacyIntegration(
  businessId: string,
  options: { replacedPhoneNumberId?: string | null } = {},
): Promise<LegacySyncResult> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      tenantId: true,
      name: true,
      whatsappPhoneNumber: true,
      whatsappPhoneNumberId: true,
      whatsappBusinessId: true,
      whatsappAccessToken: true,
      whatsappVerifyToken: true,
      whatsappAppSecret: true,
    },
  });
  if (!business) return { status: "skipped", reason: "no-business" };

  const { whatsappPhoneNumberId, whatsappBusinessId, whatsappAccessToken } = business;

  // The legacy number was replaced (or cleared): its mirrored row stops routing and
  // sending, exactly as replacing the number in the form always meant. The legacy
  // columns already describe the new state, so they are left alone.
  const replaced = options.replacedPhoneNumberId;
  if (replaced && replaced !== whatsappPhoneNumberId) {
    const old = await prisma.whatsAppIntegration.findFirst({
      where: { businessId, phoneNumberId: replaced, isActive: true },
      select: { id: true },
    });
    if (old) {
      await disconnectIntegration({
        tenantId: business.tenantId,
        businessId,
        integrationId: old.id,
        clearLegacyColumns: false,
        unsubscribeWebhooks: false,
      });
    }
  }

  if (!whatsappPhoneNumberId || !whatsappBusinessId || !whatsappAccessToken) {
    return { status: "skipped", reason: "incomplete" };
  }

  let token: string | null = null;
  try {
    token = decryptSecret(whatsappAccessToken);
  } catch {
    token = null;
  }
  if (!token || !isMetaAccessToken(token)) {
    return { status: "skipped", reason: "invalid-token" };
  }

  const result = await claimIntegration({
    tenantId: business.tenantId,
    businessId: business.id,
    phoneNumberId: whatsappPhoneNumberId,
    whatsappBusinessId,
    encryptedToken: encryptSecret(token),
    displayName: business.name,
    phoneNumber: business.whatsappPhoneNumber,
    verifyToken: business.whatsappVerifyToken,
    appSecret: business.whatsappAppSecret,
    fromLegacy: true,
  });

  if (!result.ok) {
    console.warn("[WA INTEGRATIONS] Legacy number is owned elsewhere — not mirrored", {
      businessId,
      phoneNumberId: whatsappPhoneNumberId,
    });
    return { status: "skipped", reason: "conflict" };
  }

  return { status: "synced", integrationId: result.integration.id, created: result.created };
}

// ─── Disconnect ──────────────────────────────────────────────────────────────

export type DisconnectResult =
  | { ok: true; alreadyDisconnected: boolean; promotedIntegrationId: string | null; warnings: string[] }
  | { ok: false; reason: "not-found" };

/**
 * Disconnect ONE number. Every other number of the business keeps working.
 *
 * The row is kept (inactive, token wiped) rather than deleted: threads that lived
 * on this number keep pointing at it and refuse to send, instead of silently
 * answering customers from a different number. Reconnecting the same number
 * reactivates the same row and those threads resume.
 *
 * Meta is told first, while the token still exists — and only when no other
 * active number shares the WABA, since the webhook subscription is per WABA.
 */
export async function disconnectIntegration(input: {
  tenantId: string;
  businessId: string;
  integrationId: string;
  clearLegacyColumns?: boolean;
  unsubscribeWebhooks?: boolean;
}): Promise<DisconnectResult> {
  const { tenantId, businessId, integrationId } = input;
  const clearLegacyColumns = input.clearLegacyColumns ?? true;
  const unsubscribeWebhooks = input.unsubscribeWebhooks ?? true;

  const row = await prisma.whatsAppIntegration.findFirst({
    where: { id: integrationId, businessId, tenantId },
  });
  if (!row) return { ok: false, reason: "not-found" };
  if (!row.isActive) {
    return { ok: true, alreadyDisconnected: true, promotedIntegrationId: null, warnings: [] };
  }

  const warnings: string[] = [];

  if (unsubscribeWebhooks) {
    const sharesWaba = await prisma.whatsAppIntegration.count({
      where: { whatsappBusinessId: row.whatsappBusinessId, isActive: true, NOT: { id: row.id } },
    });
    if (sharesWaba === 0) {
      try {
        const token = decryptSecret(row.accessToken);
        if (token) await unsubscribeAppFromWaba(row.whatsappBusinessId, token);
      } catch (error) {
        console.warn("[WA DISCONNECT] Could not unsubscribe webhooks", {
          integrationId: row.id,
          meta: error instanceof MetaApiError ? error.metaMessage : "token unusable",
        });
        warnings.push(
          "Disconnected here, but Meta did not confirm the webhook unsubscribe. You can also remove this app under Meta Business Settings → WhatsApp accounts.",
        );
      }
    }
  }

  let promotedIntegrationId: string | null = null;
  let clearedTenantSettings = false;

  await prisma.$transaction(async (tx) => {
    await lockBusiness(tx, businessId);

    const all = await tx.whatsAppIntegration.findMany({
      where: { businessId },
      select: { id: true, tenantId: true, businessId: true, isActive: true, isDefault: true, createdAt: true },
    });
    const current = all.find((i) => i.id === row.id);
    if (!current?.isActive) return; // a concurrent disconnect won

    const { promoteId } = planDefaultAfterDisconnect(all, row.id);

    await tx.whatsAppIntegration.update({
      where: { id: row.id },
      data: { isActive: false, isDefault: false, accessToken: null },
    });
    if (promoteId) {
      await tx.whatsAppIntegration.update({ where: { id: promoteId }, data: { isDefault: true } });
      promotedIntegrationId = promoteId;
    }

    if (clearLegacyColumns) {
      // Otherwise the legacy fallback would keep sending from, and routing, the
      // number that was just disconnected.
      await tx.business.updateMany({
        where: { id: businessId, whatsappPhoneNumberId: row.phoneNumberId },
        data: {
          whatsappAccessToken: null,
          whatsappBusinessId: null,
          whatsappPhoneNumberId: null,
          whatsappPhoneNumber: null,
        },
      });
      const cleared = await tx.tenantSettings.updateMany({
        where: { tenantId, waPhoneNumberId: row.phoneNumberId },
        data: { waPhoneNumberId: null, waApiKey: null, waBusinessAccountId: null },
      });
      clearedTenantSettings = cleared.count > 0;
    }
  });

  await invalidateTenantCache(row.phoneNumberId);
  if (clearedTenantSettings) {
    // TenantSettings is every business's last-resort fallback.
    const businesses = await prisma.business.findMany({ where: { tenantId }, select: { id: true } });
    await Promise.all(businesses.map((b) => invalidateCredsCache(b.id)));
  } else {
    await invalidateCredsCache(businessId);
  }

  return { ok: true, alreadyDisconnected: false, promotedIntegrationId, warnings };
}
