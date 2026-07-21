import { z } from "zod";

// Structural validation of what the templates API accepts. The richer Meta rules
// (naming, sequential placeholders) live in lib/templates.ts and run at submit
// time; these schemas only guarantee the JSON shape before it is persisted.

const buttonSchema = z.object({
  type: z.enum(["QUICK_REPLY", "URL", "PHONE_NUMBER"]),
  text: z.string().min(1),
  url: z.string().optional(),
  phone: z.string().optional(),
});

export const createTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required").max(512),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
  language: z.string().min(2, "Language is required"),
  body: z.string().min(1, "Body is required"),
  headerType: z.enum(["TEXT", "IMAGE", "VIDEO", "DOCUMENT"]).optional(),
  headerContent: z.string().optional(),
  footer: z.string().max(60).optional(),
  buttons: z.array(buttonSchema).max(10).optional(),
  variables: z.array(z.string()).default([]),
});

// Every field optional so an edit sends only what changed. `.strip()` drops
// unknown keys (e.g. status/waTemplateId) so they can never be edited via PATCH.
export const updateTemplateSchema = z
  .object({
    name: z.string().min(1).max(512).optional(),
    category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]).optional(),
    language: z.string().min(2).optional(),
    body: z.string().min(1).optional(),
    headerType: z.enum(["TEXT", "IMAGE", "VIDEO", "DOCUMENT"]).nullable().optional(),
    headerContent: z.string().nullable().optional(),
    footer: z.string().max(60).nullable().optional(),
    buttons: z.array(buttonSchema).max(10).nullable().optional(),
    variables: z.array(z.string()).optional(),
  })
  .strip()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
