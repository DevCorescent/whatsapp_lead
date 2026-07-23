import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Settings are edited as independent sections (General, WhatsApp, AI,
// Notifications), each saved on its own. The PATCH body is therefore a
// discriminated union on `section` so one endpoint can validate every tab
// without a mega-schema where every field is optional and nothing is enforced.
// ─────────────────────────────────────────────────────────────────────────────

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const generalSettingsSchema = z.object({
  workspaceName: z.string().min(2, "Workspace name must be at least 2 characters").max(80),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(slugRegex, "Use lowercase letters, numbers and hyphens only"),
  // Empty string clears the custom domain; a value must look like a bare hostname.
  domain: z
    .string()
    .trim()
    .regex(/^([a-z0-9-]+\.)+[a-z]{2,}$/i, "Enter a valid domain, e.g. crm.acme.com")
    .or(z.literal(""))
    .nullish(),
  language: z.string().min(2).max(10),
  timezone: z.string().min(1).max(64),
});

export const whatsappSettingsSchema = z.object({
  phoneNumberId: z.string().trim().max(64).optional(),
  businessAccountId: z.string().trim().max(64).optional(),
  appId: z.string().trim().max(64).optional(),
  verifyToken: z.string().trim().max(128).optional(),
  // Secrets: only sent when the operator actually types a new value. An empty
  // string is treated as "leave unchanged" by the route so a save that doesn't
  // touch the token never wipes it.
  apiKey: z.string().optional(),
  appSecret: z.string().optional(),
});

export const aiSettingsSchema = z.object({
  aiEnabled: z.boolean(),
  model: z.string().min(1).max(64),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(64).max(8192),
  autoReply: z.boolean(),
  replyDelay: z.number().int().min(0).max(300),
  offHoursOnly: z.boolean(),
  responseTone: z.string().max(40).optional(),
  systemPrompt: z.string().max(4000).optional(),
  timezone: z.string().min(1).max(64),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  businessDays: z.array(z.number().int().min(0).max(6)).max(7),
  offHoursMessage: z.string().max(1000).optional(),
});

const channelPrefsSchema = z.object({ email: z.boolean(), inApp: z.boolean() });

export const notificationsSettingsSchema = z.object({
  newMessage: channelPrefsSchema,
  leadAssigned: channelPrefsSchema,
  slaBreach: channelPrefsSchema,
  campaignCompleted: channelPrefsSchema,
  weeklySummary: channelPrefsSchema,
});

export const updateSettingsSchema = z.discriminatedUnion("section", [
  z.object({ section: z.literal("general"), data: generalSettingsSchema }),
  z.object({ section: z.literal("whatsapp"), data: whatsappSettingsSchema }),
  z.object({ section: z.literal("ai"), data: aiSettingsSchema }),
  z.object({ section: z.literal("notifications"), data: notificationsSettingsSchema }),
]);

export type GeneralSettingsInput = z.infer<typeof generalSettingsSchema>;
export type WhatsAppSettingsInput = z.infer<typeof whatsappSettingsSchema>;
export type AiSettingsInput = z.infer<typeof aiSettingsSchema>;
export type NotificationsSettingsInput = z.infer<typeof notificationsSettingsSchema>;
export type NotificationPrefs = NotificationsSettingsInput;

/** Defaults surfaced when a workspace has never saved notification preferences. */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  newMessage: { email: false, inApp: true },
  leadAssigned: { email: true, inApp: true },
  slaBreach: { email: true, inApp: true },
  campaignCompleted: { email: true, inApp: false },
  weeklySummary: { email: true, inApp: false },
};
