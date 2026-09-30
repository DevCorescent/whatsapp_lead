// ============================================================================
// MODULE : Segment rules (isomorphic — the builder page and the server)
//
// A segment is a list of rules, ALL of which a contact must match ("City is
// Delhi AND Tag is Student AND Status is Active"). A rule can match any of
// several values for one field ("City is any of Delhi, Noida").
// ============================================================================

import { z } from "zod";

export const TEXT_FIELDS = ["name", "location", "company", "source", "email"] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

const values = z.array(z.string().trim().min(1).max(200)).min(1).max(50);

export const segmentRuleSchema = z.discriminatedUnion("field", [
  z.object({ field: z.enum(TEXT_FIELDS), op: z.enum(["is", "contains"]), values }),
  z.object({ field: z.literal("tags"), op: z.enum(["any", "all", "none"]), values }),
  z.object({ field: z.literal("status"), op: z.literal("is"), values: z.array(z.enum(["active", "opted_out", "blacklisted"])).min(1).max(3) }),
  z.object({ field: z.literal("leadStage"), op: z.literal("any"), values }),
  z.object({
    field: z.literal("custom"),
    key: z.string().trim().min(1).max(100).regex(/^[\w .-]+$/, "Invalid custom field name"),
    op: z.enum(["is", "contains"]),
    values,
  }),
]);

export type SegmentRule = z.infer<typeof segmentRuleSchema>;

export const segmentFiltersSchema = z.object({
  rules: z.array(segmentRuleSchema).max(20, "At most 20 filters"),
});

export type SegmentFilters = z.infer<typeof segmentFiltersSchema>;

export const FIELD_LABEL: Record<SegmentRule["field"], string> = {
  name: "Name",
  location: "City / location",
  company: "Company",
  source: "Source",
  email: "Email",
  tags: "Tags",
  status: "Status",
  leadStage: "Lead stage",
  custom: "Custom field",
};

export const STATUS_LABEL = { active: "Active", opted_out: "Opted out", blacklisted: "Blacklisted" } as const;
