import { z } from "zod";

// Structural validation of what the API accepts. The richer "is this flow
// publishable" rules live in lib/chatbot.ts `validateFlow`; these schemas only
// guarantee the JSON has the right shape before it is persisted.

const nodeTypeEnum = z.enum([
  "start",
  "send_message",
  "ask_question",
  "keyword_condition",
  "button_choice",
  "collect_input",
  "assign_agent",
  "end",
]);

const nodeDataSchema = z
  .object({
    message: z.string().optional(),
    question: z.string().optional(),
    saveAs: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    prompt: z.string().optional(),
    buttons: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
    variable: z.string().optional(),
    validation: z.enum(["text", "email", "phone", "number"]).optional(),
    agentId: z.string().optional(),
    team: z.string().optional(),
  })
  .strip();

export const flowNodeSchema = z.object({
  id: z.string().min(1),
  type: nodeTypeEnum,
  position: z.object({ x: z.number(), y: z.number() }),
  data: nodeDataSchema,
});

export const flowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().optional(),
  label: z.string().optional(),
});

export const createFlowSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  description: z.string().max(500).optional(),
  keywords: z.array(z.string()).max(50).optional(),
});

// Partial update: name/description/keywords (rename), nodes/edges (save canvas),
// isActive (publish/unpublish). Every field is optional so each action sends only
// what it changes.
export const updateFlowSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    description: z.string().max(500).nullable().optional(),
    keywords: z.array(z.string()).max(50).optional(),
    nodes: z.array(flowNodeSchema).max(200).optional(),
    edges: z.array(flowEdgeSchema).max(400).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export type CreateFlowInput = z.infer<typeof createFlowSchema>;
export type UpdateFlowInput = z.infer<typeof updateFlowSchema>;
