import { z } from "zod";

const interactiveButtonSchema = z.object({
  type: z.literal("reply"),
  reply: z.object({
    id: z.string().max(256),
    title: z.string().max(20),
  }),
});

const interactiveListRowSchema = z.object({
  id: z.string().max(200),
  title: z.string().max(24),
  description: z.string().max(72).optional(),
});

export const interactivePayloadSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("button"),
    body: z.object({ text: z.string().min(1).max(1024) }),
    action: z.object({
      buttons: z.array(interactiveButtonSchema).min(1).max(3),
    }),
    header: z.object({ type: z.literal("text"), text: z.string().max(60) }).optional(),
  }),
  z.object({
    type: z.literal("list"),
    body: z.object({ text: z.string().min(1).max(4096) }),
    action: z.object({
      button: z.string().max(20),
      sections: z.array(z.object({
        title: z.string().max(24).optional(),
        rows: z.array(interactiveListRowSchema).min(1).max(10),
      })).min(1).max(10),
    }),
    header: z.object({ type: z.literal("text"), text: z.string().max(60) }).optional(),
  }),
]);

export type InteractivePayload = z.infer<typeof interactivePayloadSchema>;

export const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  type: z.enum(["TEXT", "IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "TEMPLATE", "INTERACTIVE"]).default("TEXT"),
  content: z.string().optional(),
  mediaUrl: z.string().url().optional(),
  mediaMimeType: z.string().optional(),
  mediaSize: z.number().int().positive().optional(),
  isNote: z.boolean().default(false),
  templateId: z.string().optional(),
  templateVariables: z.record(z.string(), z.string()).optional(),
  interactive: interactivePayloadSchema.optional(),
  replyToId: z.string().optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
