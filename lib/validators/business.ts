import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Validation for the Business (Workspace) CRUD endpoints. A business carries its
// own WhatsApp number and AI configuration, so the schemas cover both the
// identity fields (name, logo, timezone) and the per-business integration fields.
// Secrets (the access token) are only sent when the operator types a new value;
// an omitted/empty token means "leave unchanged", mirroring the settings module.
// ─────────────────────────────────────────────────────────────────────────────

const waFields = {
  whatsappPhoneNumber: z.string().trim().max(32).optional(),
  whatsappPhoneNumberId: z.string().trim().max(64).optional(),
  whatsappBusinessId: z.string().trim().max(64).optional(),
  whatsappAccessToken: z.string().max(2000).optional(),
  whatsappVerifyToken: z.string().trim().max(128).optional(),
};

export const createBusinessSchema = z.object({
  name: z.string().min(2, "Business name must be at least 2 characters").max(80),
  timezone: z.string().min(1).max(64).optional(),
  logo: z.string().url().or(z.literal("")).optional(),
  ...waFields,
});

export const updateBusinessSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  timezone: z.string().min(1).max(64).optional(),
  logo: z.string().url().or(z.literal("")).nullish(),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
  ...waFields,
  // Per-business AI / chatbot overrides.
  aiEnabled: z.boolean().optional(),
  autoReply: z.boolean().optional(),
  autoReplyDelay: z.number().int().min(0).max(300).optional(),
  aiModel: z.string().max(64).optional(),
  aiSystemPrompt: z.string().max(4000).optional(),
  aiPersonality: z.string().max(4000).optional(),
  aiResponseTone: z.string().max(40).optional(),
  aiTemperature: z.number().min(0).max(2).optional(),
  aiMaxTokens: z.number().int().min(64).max(8192).optional(),
  offHoursMessage: z.string().max(1000).optional(),
});

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;
