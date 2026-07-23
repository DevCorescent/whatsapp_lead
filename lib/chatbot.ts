// ============================================================================
// MODULE : Chatbot flow model, metadata & validation
// ============================================================================
//
// The single source of truth for what a chatbot flow *is*: its node types, the
// shape of each node's config, and the rules a flow must satisfy to be published.
// Shared by the builder UI (live validation, palette, inspector) and the API
// (the publish gate), so the two can never disagree about what a valid flow is.
//
// A flow is stored on ChatbotFlow.nodes / ChatbotFlow.edges as JSON. Nothing here
// executes a flow — this is the design-time model only.

export type NodeType =
  | "start"
  | "send_message"
  | "ask_question"
  | "keyword_condition"
  | "button_choice"
  | "collect_input"
  | "assign_agent"
  | "end";

export interface FlowNodeData {
  /** send_message */
  message?: string;
  /** ask_question */
  question?: string;
  /** ask_question / collect_input — the variable the reply is stored under */
  saveAs?: string;
  /** keyword_condition — words that route down the "matched" branch */
  keywords?: string[];
  /** button_choice — prompt shown above the buttons */
  prompt?: string;
  /** button_choice — each button is also an output handle (handle id === button.id) */
  buttons?: { id: string; label: string }[];
  /** collect_input — the variable name to store the captured value */
  variable?: string;
  /** collect_input — how the captured value is validated */
  validation?: "text" | "email" | "phone" | "number";
  /** assign_agent */
  agentId?: string;
  team?: string;
}

export interface FlowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: FlowNodeData;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  /** Distinguishes multiple outputs on one node: "matched"/"else", or a button id. */
  sourceHandle?: string;
  label?: string;
}

/** Static, UI-agnostic description of each node type (icon is resolved in the UI). */
export interface NodeMeta {
  type: NodeType;
  label: string;
  description: string;
  /** Tailwind classes for the node header accent. */
  accent: string;
  /** Whether the builder allows this node to be deleted (Start/End are structural). */
  deletable: boolean;
  /** Whether the node accepts an incoming connection (Start does not). */
  hasInput: boolean;
  /** Fixed output handles. Empty means the outputs are dynamic (buttons). */
  outputs: { id: string; label: string }[];
  /** True when outputs come from the node's own data (button_choice). */
  dynamicOutputs?: boolean;
}

const OUT = [{ id: "out", label: "" }];

export const NODE_META: Record<NodeType, NodeMeta> = {
  start: {
    type: "start",
    label: "Start",
    description: "Where the flow begins.",
    accent: "bg-slate-900 text-white",
    deletable: false,
    hasInput: false,
    outputs: OUT,
  },
  send_message: {
    type: "send_message",
    label: "Send Message",
    description: "Send a text message to the customer.",
    accent: "bg-emerald-50 text-emerald-700",
    deletable: true,
    hasInput: true,
    outputs: OUT,
  },
  ask_question: {
    type: "ask_question",
    label: "Ask Question",
    description: "Ask a question and store the reply.",
    accent: "bg-sky-50 text-sky-700",
    deletable: true,
    hasInput: true,
    outputs: OUT,
  },
  keyword_condition: {
    type: "keyword_condition",
    label: "Keyword Condition",
    description: "Branch on whether the reply matches a keyword.",
    accent: "bg-amber-50 text-amber-800",
    deletable: true,
    hasInput: true,
    outputs: [
      { id: "matched", label: "Matched" },
      { id: "else", label: "Else" },
    ],
  },
  button_choice: {
    type: "button_choice",
    label: "Button Choice",
    description: "Offer buttons; each routes to its own next step.",
    accent: "bg-violet-50 text-violet-700",
    deletable: true,
    hasInput: true,
    outputs: [],
    dynamicOutputs: true,
  },
  collect_input: {
    type: "collect_input",
    label: "Collect Input",
    description: "Capture a value into a variable with validation.",
    accent: "bg-teal-50 text-teal-700",
    deletable: true,
    hasInput: true,
    outputs: OUT,
  },
  assign_agent: {
    type: "assign_agent",
    label: "Assign Human Agent",
    description: "Hand the conversation to a human agent or team.",
    accent: "bg-rose-50 text-rose-700",
    deletable: true,
    hasInput: true,
    outputs: OUT,
  },
  end: {
    type: "end",
    label: "End Conversation",
    description: "Ends the flow.",
    accent: "bg-slate-100 text-slate-600",
    deletable: true,
    hasInput: true,
    outputs: [],
  },
};

/** The node types offered in the builder palette (Start is created with the flow). */
export const PALETTE_NODE_TYPES: NodeType[] = [
  "send_message",
  "ask_question",
  "keyword_condition",
  "button_choice",
  "collect_input",
  "assign_agent",
  "end",
];

/** Sensible default config for a freshly-dropped node of each type. */
export function defaultNodeData(type: NodeType): FlowNodeData {
  switch (type) {
    case "send_message":
      return { message: "" };
    case "ask_question":
      return { question: "", saveAs: "" };
    case "keyword_condition":
      return { keywords: [] };
    case "button_choice":
      return { prompt: "", buttons: [{ id: cryptoId(), label: "Yes" }, { id: cryptoId(), label: "No" }] };
    case "collect_input":
      return { variable: "", validation: "text" };
    case "assign_agent":
      return { agentId: "", team: "" };
    default:
      return {};
  }
}

/** The output handles a node actually exposes (dynamic for button_choice). */
export function nodeOutputs(node: FlowNode): { id: string; label: string }[] {
  const meta = NODE_META[node.type];
  if (meta.dynamicOutputs) {
    return (node.data.buttons ?? []).map((b) => ({ id: b.id, label: b.label || "Button" }));
  }
  return meta.outputs;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface FlowIssue {
  level: "error" | "warning";
  message: string;
  nodeId?: string;
}

export interface FlowValidation {
  errors: FlowIssue[];
  warnings: FlowIssue[];
  ok: boolean; // true when there are no errors
}

/**
 * Validate a flow's structure. Errors block publishing; warnings are advisory.
 *
 * Errors: not exactly one Start; no End; an edge pointing at a missing node
 * (broken link); a non-End node with no outgoing connection (a dead end that
 * would strand the conversation). Warnings: a node unreachable from Start, a
 * button with no destination, and any cycle (a legitimate design in some bots,
 * so it is flagged rather than forbidden).
 */
export function validateFlow(nodes: FlowNode[], edges: FlowEdge[]): FlowValidation {
  const errors: FlowIssue[] = [];
  const warnings: FlowIssue[] = [];
  const ids = new Set(nodes.map((n) => n.id));

  const starts = nodes.filter((n) => n.type === "start");
  const ends = nodes.filter((n) => n.type === "end");

  if (starts.length === 0) errors.push({ level: "error", message: "Add a Start node." });
  if (starts.length > 1)
    errors.push({ level: "error", message: "A flow can only have one Start node." });
  if (ends.length === 0)
    errors.push({ level: "error", message: "Add at least one End node — every flow must end." });

  // Broken links: edges must connect existing nodes.
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) {
      errors.push({ level: "error", message: "A connection points to a node that no longer exists." });
      break;
    }
  }

  // Dead ends: any node that is not an End must lead somewhere.
  const outgoing = new Map<string, FlowEdge[]>();
  for (const e of edges) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source)!.push(e);
  }
  for (const n of nodes) {
    if (n.type === "end") continue;
    if (!(outgoing.get(n.id)?.length)) {
      errors.push({
        level: "error",
        message: `“${NODE_META[n.type].label}” has no next step.`,
        nodeId: n.id,
      });
    }
    // Every button should have a destination.
    if (n.type === "button_choice") {
      const handled = new Set((outgoing.get(n.id) ?? []).map((e) => e.sourceHandle));
      for (const b of n.data.buttons ?? []) {
        if (!handled.has(b.id)) {
          warnings.push({
            level: "warning",
            message: `Button “${b.label || "?"}” isn't connected to anything.`,
            nodeId: n.id,
          });
        }
      }
    }
  }

  // Reachability & cycle detection from the Start node.
  if (starts.length === 1) {
    const start = starts[0];
    const visited = new Set<string>();
    const stack = new Set<string>();
    let cyclic = false;

    const walk = (id: string) => {
      visited.add(id);
      stack.add(id);
      for (const e of outgoing.get(id) ?? []) {
        if (stack.has(e.target)) cyclic = true;
        else if (!visited.has(e.target)) walk(e.target);
      }
      stack.delete(id);
    };
    walk(start.id);

    if (cyclic) {
      warnings.push({ level: "warning", message: "This flow contains a loop — double-check it's intentional." });
    }
    for (const n of nodes) {
      if (n.id !== start.id && !visited.has(n.id)) {
        warnings.push({
          level: "warning",
          message: `“${NODE_META[n.type].label}” can't be reached from Start.`,
          nodeId: n.id,
        });
      }
    }
  }

  return { errors, warnings, ok: errors.length === 0 };
}

/**
 * A short, collision-resistant id for nodes/edges/buttons created in the browser.
 * Uses crypto.randomUUID when available, falling back to a timestamped random.
 */
export function cryptoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}
