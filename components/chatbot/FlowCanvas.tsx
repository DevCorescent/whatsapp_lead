"use client";

import { useRef } from "react";
import { X } from "lucide-react";
import { NODE_META, nodeOutputs, type FlowNode, type FlowEdge } from "@/lib/chatbot";
import { NODE_ICON } from "@/components/chatbot/nodeIcons";
import { cn } from "@/lib/utils";

// Fixed node geometry so edge anchors and the rendered handles always agree.
const NODE_W = 224;
const HEADER_MID = 22; // y of the input handle & single-output handle (header centre)
const HEADER_H = 44;
const ROW_H = 28;

/** Absolute position of a node's input handle, in canvas coordinates. */
function inputAnchor(n: FlowNode) {
  return { x: n.position.x, y: n.position.y + HEADER_MID };
}

/** Absolute position of one of a node's output handles. */
function outputAnchor(n: FlowNode, handleId: string) {
  const outs = nodeOutputs(n);
  if (outs.length <= 1) return { x: n.position.x + NODE_W, y: n.position.y + HEADER_MID };
  const idx = Math.max(0, outs.findIndex((o) => o.id === handleId));
  return { x: n.position.x + NODE_W, y: n.position.y + HEADER_H + idx * ROW_H + ROW_H / 2 };
}

/** A horizontal cubic-bezier between two anchor points. */
function edgePath(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

export interface FlowCanvasProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  selectedId: string | null;
  connecting: { source: string; handle: string } | null;
  onSelect: (id: string | null) => void;
  onMoveNode: (id: string, pos: { x: number; y: number }) => void;
  onStartConnect: (source: string, handle: string) => void;
  onCompleteConnect: (target: string) => void;
  onCancelConnect: () => void;
  onDeleteNode: (id: string) => void;
  onDeleteEdge: (id: string) => void;
}

export function FlowCanvas(props: FlowCanvasProps) {
  const {
    nodes,
    edges,
    selectedId,
    connecting,
    onSelect,
    onMoveNode,
    onStartConnect,
    onCompleteConnect,
    onCancelConnect,
    onDeleteNode,
    onDeleteEdge,
  } = props;

  const surfaceRef = useRef<HTMLDivElement>(null);
  // Live drag state kept in a ref so pointermove doesn't churn React state on the listener.
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const onNodePointerDown = (e: React.PointerEvent, node: FlowNode) => {
    // Ignore drags that begin on a handle or button — those have their own behaviour.
    if ((e.target as HTMLElement).closest("[data-handle],[data-nodrag]")) return;
    e.preventDefault();
    onSelect(node.id);
    const surface = surfaceRef.current;
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    drag.current = {
      id: node.id,
      dx: e.clientX - rect.left - node.position.x,
      dy: e.clientY - rect.top - node.position.y,
    };

    const move = (ev: PointerEvent) => {
      if (!drag.current) return;
      const x = Math.max(0, ev.clientX - rect.left - drag.current.dx);
      const y = Math.max(0, ev.clientY - rect.top - drag.current.dy);
      onMoveNode(drag.current.id, { x, y });
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={surfaceRef}
      onClick={(e) => {
        // A click on empty canvas clears selection / cancels a pending connection.
        if (e.target === e.currentTarget) {
          onSelect(null);
          if (connecting) onCancelConnect();
        }
      }}
      className="relative h-full min-h-[30rem] w-full overflow-auto"
      style={{
        backgroundImage: "radial-gradient(circle, rgb(203 213 225) 1px, transparent 1px)",
        backgroundSize: "18px 18px",
      }}
    >
      {/* A generous canvas so nodes can be spread out and scrolled. */}
      <div className="relative h-[1600px] w-[2400px]">
        {/* Edges */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <marker id="cb-arrow" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
              <path d="M0,0 L9,4.5 L0,9 Z" fill="rgb(148 163 184)" />
            </marker>
          </defs>
          {edges.map((edge) => {
            const source = nodes.find((n) => n.id === edge.source);
            const target = nodes.find((n) => n.id === edge.target);
            if (!source || !target) return null;
            const a = outputAnchor(source, edge.sourceHandle ?? "out");
            const b = inputAnchor(target);
            return (
              <g key={edge.id} className="pointer-events-auto">
                {/* Invisible fat hit-area makes the thin edge easy to click to delete. */}
                <path
                  d={edgePath(a, b)}
                  stroke="transparent"
                  strokeWidth={14}
                  fill="none"
                  className="cursor-pointer"
                  onClick={() => onDeleteEdge(edge.id)}
                />
                <path
                  d={edgePath(a, b)}
                  stroke="rgb(148 163 184)"
                  strokeWidth={2}
                  fill="none"
                  markerEnd="url(#cb-arrow)"
                  className="pointer-events-none"
                />
              </g>
            );
          })}
        </svg>

        {/* Nodes */}
        {nodes.map((node) => {
          const meta = NODE_META[node.type];
          const Icon = NODE_ICON[node.type];
          const outs = nodeOutputs(node);
          const selected = node.id === selectedId;
          const isConnectSource = connecting?.source === node.id;

          return (
            <div
              key={node.id}
              onPointerDown={(e) => onNodePointerDown(e, node)}
              onClick={(e) => {
                e.stopPropagation();
                if (connecting && connecting.source !== node.id && meta.hasInput) {
                  onCompleteConnect(node.id);
                } else {
                  onSelect(node.id);
                }
              }}
              style={{ left: node.position.x, top: node.position.y, width: NODE_W }}
              className={cn(
                "absolute cursor-grab touch-none select-none rounded-xl bg-white shadow-md ring-1 transition active:cursor-grabbing",
                selected ? "ring-2 ring-emerald-500" : "ring-slate-200",
                connecting && meta.hasInput && !isConnectSource ? "ring-emerald-300" : "",
              )}
            >
              {/* Header */}
              <div className={cn("flex items-center gap-2 rounded-t-xl px-3 py-2.5", meta.accent)}>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate text-xs font-semibold uppercase tracking-wide">
                  {meta.label}
                </span>
                {meta.deletable && (
                  <button
                    data-nodrag
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteNode(node.id);
                    }}
                    aria-label="Delete node"
                    className="ml-auto rounded p-0.5 opacity-70 transition hover:bg-black/10 hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Body */}
              <NodeBody node={node} />

              {/* Multi-output rows (each row hosts its output handle) */}
              {outs.length > 1 &&
                outs.map((o, i) => (
                  <div
                    key={o.id}
                    className="relative flex h-7 items-center justify-end border-t border-slate-100 px-3 text-[11px] font-medium text-slate-500"
                  >
                    {o.label}
                    <OutputHandle
                      active={isConnectSource && connecting?.handle === o.id}
                      onStart={(e) => {
                        e.stopPropagation();
                        onStartConnect(node.id, o.id);
                      }}
                      style={{ top: HEADER_H + i * ROW_H + ROW_H / 2 }}
                    />
                  </div>
                ))}

              {/* Single-output handle (header height) */}
              {outs.length === 1 && (
                <OutputHandle
                  active={isConnectSource}
                  onStart={(e) => {
                    e.stopPropagation();
                    onStartConnect(node.id, outs[0].id);
                  }}
                  style={{ top: HEADER_MID }}
                />
              )}

              {/* Input handle */}
              {meta.hasInput && (
                <span
                  data-handle
                  style={{ top: HEADER_MID }}
                  className="absolute -left-1.5 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-white bg-slate-300"
                />
              )}
            </div>
          );
        })}
      </div>

      {connecting && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white shadow-lg">
          Click a node to connect · click empty space to cancel
        </div>
      )}
    </div>
  );
}

function OutputHandle({
  active,
  onStart,
  style,
}: {
  active: boolean;
  onStart: (e: React.PointerEvent) => void;
  style: React.CSSProperties;
}) {
  return (
    <button
      data-handle
      aria-label="Connect from here"
      onPointerDown={onStart}
      style={style}
      className={cn(
        "absolute -right-1.5 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-white transition hover:scale-125",
        active ? "bg-emerald-500 ring-2 ring-emerald-200" : "bg-slate-400 hover:bg-emerald-500",
      )}
    />
  );
}

function NodeBody({ node }: { node: FlowNode }) {
  const text = (() => {
    switch (node.type) {
      case "start":
        return "Entry point of the flow.";
      case "send_message":
        return node.data.message?.trim() || "No message set yet.";
      case "ask_question":
        return node.data.question?.trim() || "No question set yet.";
      case "keyword_condition":
        return node.data.keywords?.length
          ? `Keywords: ${node.data.keywords.join(", ")}`
          : "No keywords set yet.";
      case "button_choice":
        return node.data.prompt?.trim() || "Ask the customer to pick an option.";
      case "collect_input":
        return node.data.variable
          ? `Save to {${node.data.variable}} · ${node.data.validation ?? "text"}`
          : "No variable set yet.";
      case "assign_agent":
        return node.data.team || node.data.agentId
          ? `Assign to ${node.data.team || "agent"}`
          : "Hand off to a human agent.";
      case "end":
        return "The conversation ends here.";
      default:
        return "";
    }
  })();

  return <p className="line-clamp-3 px-3 py-2.5 text-xs leading-relaxed text-slate-600">{text}</p>;
}
