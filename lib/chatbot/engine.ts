import type {
  ApiNodeData,
  ConditionNodeData,
  ConditionRoute,
  DelayNodeData,
  FlowDocument,
  FlowNode,
  HandoffNodeData,
  MessageNodeData,
  QuestionNodeData,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Flow execution engine.
//
// A single traversal step: starting from a node (the flow's Start on the first
// turn, or the node after the last unanswered Question on later turns), walk the
// graph executing Message / Condition / Delay / API / AI / Handoff nodes until it
// reaches a Question (which must wait for the user's reply), an End node, or a dead
// end. Side-effecting nodes (API, AI) are delegated to injected executors so the
// engine stays pure and is reused by both the server pipeline and the client
// preview simulator.
//
// State (current node + collected variables) is returned to the caller to persist
// however it likes — the engine itself holds none, so it works with the existing
// ChatbotFlow model without any schema change.
// ─────────────────────────────────────────────────────────────────────────────

export type FlowVariables = Record<string, string>;

export interface EngineExecutors {
  /** Perform an API-call node. Returns the value stored under its `saveAs`. */
  callApi?: (node: ApiNodeData, vars: FlowVariables) => Promise<string>;
  /** Generate an AI reply for an AI node. Returns the reply text. */
  callAi?: (node: AiPrompt, vars: FlowVariables) => Promise<string>;
}

interface AiPrompt {
  prompt?: string;
  model?: string;
  temperature?: number;
  saveAs?: string;
}

export type EngineActionType = "message" | "typing" | "delay" | "api" | "ai" | "handoff";

export interface EngineAction {
  type: EngineActionType;
  nodeId: string;
  /** Rendered outbound text for message/ai actions. */
  text?: string;
  /** Seconds for delay/typing actions. */
  seconds?: number;
  /** Handoff details. */
  handoff?: { team?: string; queue?: string; department?: string; note?: string };
  /** API details (for preview/telemetry). */
  api?: { method?: string; url?: string; saveAs?: string };
}

export type EngineStatus = "awaiting_input" | "ended" | "dead_end" | "error";

export interface EngineStepResult {
  actions: EngineAction[];
  variables: FlowVariables;
  /** Node the run stopped on (the Question awaiting input, or the End/dead-end node). */
  stoppedAtNodeId: string | null;
  /** When awaiting input, the question node whose answer feeds the next step. */
  awaitingQuestionId: string | null;
  status: EngineStatus;
  handoff: boolean;
}

export interface RunOptions {
  /** Node to start from. Defaults to the flow's Start node. */
  fromNodeId?: string;
  /** The user's latest reply — stored under the awaiting question's variable. */
  input?: string;
  variables?: FlowVariables;
  executors?: EngineExecutors;
  /** Guard against pathological graphs. */
  maxSteps?: number;
}

/** Substitute {{variable}} tokens in a template using the collected variables. */
export function renderTemplate(template: string | undefined, vars: FlowVariables): string {
  if (!template) return "";
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, name: string) => vars[name] ?? "");
}

function findStart(doc: FlowDocument): FlowNode | undefined {
  return doc.nodes.find((n) => n.type === "start");
}

function nodeById(doc: FlowDocument, id: string): FlowNode | undefined {
  return doc.nodes.find((n) => n.id === id);
}

/** Follow the first outgoing edge (optionally from a specific source handle). */
function nextNodeId(doc: FlowDocument, nodeId: string, sourceHandle?: string): string | null {
  const edges = doc.edges.filter(
    (e) => e.source === nodeId && (sourceHandle === undefined || (e.sourceHandle ?? null) === sourceHandle),
  );
  return edges[0]?.target ?? null;
}

function evalRoute(route: ConditionRoute, vars: FlowVariables): boolean {
  const left = (route.variable ? vars[route.variable] : "") ?? "";
  const right = route.value ?? "";
  switch (route.operator) {
    case "eq":
      return left === right;
    case "neq":
      return left !== right;
    case "contains":
      return left.toLowerCase().includes(right.toLowerCase());
    case "gt":
      return Number(left) > Number(right);
    case "lt":
      return Number(left) < Number(right);
    case "exists":
      return left.trim().length > 0;
    default:
      return false;
  }
}

/**
 * Run one traversal step. Async because API/AI nodes may perform real work via the
 * injected executors; with no executors those nodes are recorded as actions and
 * skipped (used by the lightweight preview).
 */
export async function runFlowStep(doc: FlowDocument, opts: RunOptions = {}): Promise<EngineStepResult> {
  const variables: FlowVariables = { ...(opts.variables ?? {}) };
  const actions: EngineAction[] = [];
  const maxSteps = opts.maxSteps ?? 200;

  const start = opts.fromNodeId ? nodeById(doc, opts.fromNodeId) : findStart(doc);
  if (!start) {
    return { actions, variables, stoppedAtNodeId: null, awaitingQuestionId: null, status: "error", handoff: false };
  }

  // If we're resuming after a question, the caller passes fromNodeId = that question
  // and the user's input; store it, then continue from the question's output.
  let currentId: string | null = start.id;
  if (opts.fromNodeId && start.type === "question" && opts.input !== undefined) {
    const q = start.data as QuestionNodeData;
    if (q.variable) variables[q.variable] = opts.input;
    currentId = nextNodeId(doc, start.id);
  } else if (start.type === "start") {
    currentId = nextNodeId(doc, start.id);
  }

  let steps = 0;
  const visited = new Set<string>();

  while (currentId && steps < maxSteps) {
    steps += 1;
    const node = nodeById(doc, currentId);
    if (!node) break;

    // Loop guard: if we revisit a node in the same step run, stop.
    if (visited.has(node.id)) break;
    visited.add(node.id);

    switch (node.type) {
      case "message": {
        const d = node.data as MessageNodeData;
        if (d.typingDelay && d.typingDelay > 0) {
          actions.push({ type: "typing", nodeId: node.id, seconds: d.typingDelay });
        }
        actions.push({ type: "message", nodeId: node.id, text: renderTemplate(d.text, variables) });
        currentId = nextNodeId(doc, node.id);
        break;
      }
      case "delay": {
        const d = node.data as DelayNodeData;
        actions.push({ type: "delay", nodeId: node.id, seconds: d.seconds ?? 0 });
        currentId = nextNodeId(doc, node.id);
        break;
      }
      case "condition": {
        const d = node.data as ConditionNodeData;
        const match = (d.routes ?? []).find((r) => evalRoute(r, variables));
        // Route handle id is the route id; fallback handle is "else".
        currentId = nextNodeId(doc, node.id, match ? match.id : "else") ?? nextNodeId(doc, node.id);
        break;
      }
      case "api": {
        const d = node.data as ApiNodeData;
        actions.push({ type: "api", nodeId: node.id, api: { method: d.method, url: renderTemplate(d.url, variables), saveAs: d.saveAs } });
        if (opts.executors?.callApi) {
          try {
            const result = await opts.executors.callApi(d, variables);
            if (d.saveAs) variables[d.saveAs] = result;
          } catch {
            // Non-fatal: continue the flow even if the call fails.
          }
        }
        currentId = nextNodeId(doc, node.id);
        break;
      }
      case "ai": {
        const d = node.data as AiPrompt;
        let text = "";
        if (opts.executors?.callAi) {
          try {
            text = await opts.executors.callAi(d, variables);
            if (d.saveAs) variables[d.saveAs] = text;
          } catch {
            text = "";
          }
        }
        actions.push({ type: "ai", nodeId: node.id, text });
        currentId = nextNodeId(doc, node.id);
        break;
      }
      case "handoff": {
        const d = node.data as HandoffNodeData;
        actions.push({ type: "handoff", nodeId: node.id, handoff: { team: d.team, queue: d.queue, department: d.department, note: d.note } });
        return { actions, variables, stoppedAtNodeId: node.id, awaitingQuestionId: null, status: "ended", handoff: true };
      }
      case "question": {
        const d = node.data as QuestionNodeData;
        actions.push({ type: "message", nodeId: node.id, text: renderTemplate(d.question, variables) });
        return { actions, variables, stoppedAtNodeId: node.id, awaitingQuestionId: node.id, status: "awaiting_input", handoff: false };
      }
      case "end":
        return { actions, variables, stoppedAtNodeId: node.id, awaitingQuestionId: null, status: "ended", handoff: false };
      case "start":
        currentId = nextNodeId(doc, node.id);
        break;
      default:
        currentId = nextNodeId(doc, node.id);
        break;
    }
  }

  return {
    actions,
    variables,
    stoppedAtNodeId: currentId,
    awaitingQuestionId: null,
    status: currentId ? "dead_end" : "ended",
    handoff: false,
  };
}
