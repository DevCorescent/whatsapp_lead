import { z } from "zod";
import { isValidPhone, normalizePhone } from "@/lib/import";

export const createContactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  // Stored in the shared digits-only form so a manually added "+91 98765 43210" is the
  // same contact as an imported "9876543210" or an inbound WhatsApp message — the
  // (phone, businessId) unique key only prevents duplicates if every path agrees.
  phone: z
    .string()
    .transform((v) => normalizePhone(v))
    .refine(isValidPhone, "Invalid phone number (use e.g. +919876543210)"),
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
