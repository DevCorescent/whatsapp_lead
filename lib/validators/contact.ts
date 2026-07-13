import { z } from "zod";

export const createContactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{9,14}$/, "Invalid phone number (use e.g. +919876543210)"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  company: z.string().optional(),
  designation: z.string().optional(),
  location: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const updateContactSchema = createContactSchema.partial();

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
