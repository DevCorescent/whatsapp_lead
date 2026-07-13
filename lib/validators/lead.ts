import { z } from "zod";

const LeadStageEnum = z.enum([
  "NEW_LEAD",
  "CONTACTED",
  "QUALIFIED",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
]);

export const createLeadSchema = z.object({
  contactId: z.string().min(1, "Contact is required"),
  title: z.string().min(1, "Title is required"),
  stage: LeadStageEnum.optional(),
  value: z.number().positive().optional(),
  currency: z.string().default("INR"),
  budget: z.string().optional(),
  requirement: z.string().optional(),
  timeline: z.string().optional(),
  companySize: z.string().optional(),
  isDecisionMaker: z.boolean().optional(),
  notes: z.string().optional(),
  assignedToId: z.string().optional(),
});

export const updateLeadSchema = createLeadSchema.partial().extend({
  score: z.number().min(0).max(100).optional(),
  lostReason: z.string().optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
