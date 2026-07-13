import { z } from "zod";

export const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  type: z.enum(["TEXT", "IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "TEMPLATE"]).default("TEXT"),
  content: z.string().optional(),
  mediaUrl: z.string().url().optional(),
  isNote: z.boolean().default(false),
  templateId: z.string().optional(),
  templateVariables: z.record(z.string()).optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
