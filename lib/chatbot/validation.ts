import type { FlowDocument, FlowNode } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Flow validation — run both server-side (POST /api/chatbot/flows/[id]/validate,
// enforced before publishing) and client-side (the builder's Publish gate). Pure
// and framework-free.
// ─────────────────────────────────────────────────────────────────────────────

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  code:
    | "missing_start"
    | "multiple_starts"
    | "orphan_node"
    | "unreachable_node"
    | "cycle"
    | "invalid_api"
    | "empty_message"
    | "question_no_variable"
    | "duplicate_variable"
    | "condition_no_routes"
    | "dead_end"
    | "empty_flow";
  severity: ValidationSeverity;
  message: string;
  nodeId?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

function isValidUrl(url?: string): boolean {
  if (!url || !url.trim()) return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function outgoing(edges: FlowDocument["edges"], nodeId: string) {
  return edges.filter((e) => e.source === nodeId);
}

function incoming(edges: FlowDocument["edges"], nodeId: string) {
  return edges.filter((e) => e.target === nodeId);
}

/** Reachable set from the start node, following edges forward. */
function reachableFrom(doc: FlowDocument, startId: string): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of doc.edges) {
    const list = adj.get(e.source) ?? [];
    list.push(e.target);
    adj.set(e.source, list);
  }
  const seen = new Set<string>();
  const stack = [startId];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of adj.get(id) ?? []) if (!seen.has(next)) stack.push(next);
  }
  return seen;
}

/** Detect a directed cycle via DFS colouring. */
function hasCycle(doc: FlowDocument): boolean {
  const adj = new Map<string, string[]>();
  for (const e of doc.edges) {
    const list = adj.get(e.source) ?? [];
    list.push(e.target);
    adj.set(e.source, list);
  }
  const WHITE = 0, GREY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const n of doc.nodes) color.set(n.id, WHITE);

  const visit = (id: string): boolean => {
    color.set(id, GREY);
    for (const next of adj.get(id) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GREY) return true;
      if (c === WHITE && visit(next)) return true;
    }
    color.set(id, BLACK);
    return false;
  };

  for (const n of doc.nodes) {
    if ((color.get(n.id) ?? WHITE) === WHITE && visit(n.id)) return true;
  }
  return false;
}

function messageIsEmpty(node: FlowNode): boolean {
  const d = node.data as { text?: string; mediaUrl?: string };
  return !d.text?.trim() && !d.mediaUrl?.trim();
}

export function validateFlow(doc: FlowDocument): ValidationResult {
  const issues: ValidationIssue[] = [];
  const variableOwners = new Map<string, string>();

  if (doc.nodes.length === 0) {
    return { valid: false, issues: [{ code: "empty_flow", severity: "error", message: "The flow has no nodes." }] };
  }

  const starts = doc.nodes.filter((n) => n.type === "start");
  if (starts.length === 0) {
    issues.push({ code: "missing_start", severity: "error", message: "Add a Start Trigger node — the flow has no entry point." });
  }
  if (starts.length > 1) {
    for (const s of starts.slice(1)) {
      issues.push({ code: "multiple_starts", severity: "error", message: "Only one Start Trigger is allowed.", nodeId: s.id });
    }
  }

  // Reachability (only meaningful with exactly one start).
  const reachable = starts.length === 1 ? reachableFrom(doc, starts[0].id) : new Set<string>();

  for (const node of doc.nodes) {
    // Orphan: non-start with no incoming edge.
    if (node.type !== "start" && incoming(doc.edges, node.id).length === 0) {
      issues.push({ code: "orphan_node", severity: "error", message: `"${labelOf(node)}" has no incoming connection.`, nodeId: node.id });
    }

    // Unreachable from start.
    if (starts.length === 1 && node.type !== "start" && !reachable.has(node.id)) {
      issues.push({ code: "unreachable_node", severity: "warning", message: `"${labelOf(node)}" can't be reached from the Start Trigger.`, nodeId: node.id });
    }

    // Dead end: non-end node with no outgoing edge.
    if (node.type !== "end" && node.type !== "handoff" && outgoing(doc.edges, node.id).length === 0) {
      issues.push({ code: "dead_end", severity: "warning", message: `"${labelOf(node)}" has no outgoing connection.`, nodeId: node.id });
    }

    // Per-kind content checks.
    if (node.type === "message" && messageIsEmpty(node)) {
      issues.push({ code: "empty_message", severity: "error", message: `Message "${labelOf(node)}" has no text or media.`, nodeId: node.id });
    }
    if (node.type === "question") {
      const d = node.data as { variable?: string };
      if (!d.variable?.trim()) {
        issues.push({ code: "question_no_variable", severity: "error", message: `Question "${labelOf(node)}" must store its answer in a variable.`, nodeId: node.id });
      } else {
        const variable = d.variable.trim();
        if (variableOwners.has(variable)) {
          issues.push({ code: "duplicate_variable", severity: "error", message: `Variable "${variable}" is used by more than one question.`, nodeId: node.id });
        } else {
          variableOwners.set(variable, node.id);
        }
      }
    }
    if (node.type === "condition") {
      const d = node.data as { routes?: unknown[] };
      if (!Array.isArray(d.routes) || d.routes.length === 0) {
        issues.push({ code: "condition_no_routes", severity: "error", message: `Condition "${labelOf(node)}" has no routes.`, nodeId: node.id });
      }
    }
    if (node.type === "api") {
      const d = node.data as { url?: string };
      if (!isValidUrl(d.url)) {
        issues.push({ code: "invalid_api", severity: "error", message: `API Call "${labelOf(node)}" needs a valid http(s) URL.`, nodeId: node.id });
      }
    }
  }

  if (hasCycle(doc)) {
    issues.push({ code: "cycle", severity: "error", message: "The flow contains a loop — remove the cyclic connection." });
  }

  const valid = !issues.some((i) => i.severity === "error");
  return { valid, issues };
}

function labelOf(node: FlowNode): string {
  const d = node.data as { label?: string };
  return d.label?.trim() || node.type;
}
