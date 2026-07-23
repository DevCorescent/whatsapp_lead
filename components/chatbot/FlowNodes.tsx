"use client";

import { memo } from "react";
import { Handle, NodeResizer, Position, type NodeProps, type NodeTypes } from "@xyflow/react";
import { cn } from "@/lib/utils";
import {
  NODE_META,
  type NodeKind,
  type MessageNodeData,
  type QuestionNodeData,
  type ConditionNodeData,
  type ApiNodeData,
  type DelayNodeData,
  type HandoffNodeData,
  type AiNodeData,
} from "@/lib/chatbot/types";
import { NODE_ICON } from "./nodeMeta";

const handleClass = "h-2.5! w-2.5! border-2! border-white! bg-slate-400!";

function NodeShell({
  kind,
  title,
  children,
  selected,
  width,
  height,
  resizable = true,
}: {
  kind: NodeKind;
  title: string;
  children?: React.ReactNode;
  selected?: boolean;
  width?: number | null;
  height?: number | null;
  resizable?: boolean;
}) {
  const meta = NODE_META[kind];
  const Icon = NODE_ICON[kind];
  return (
    <div
      className={cn(
        "min-h-28 min-w-56 rounded-xl border bg-white shadow-md transition",
        selected ? "border-emerald-500 ring-2 ring-emerald-500/30" : "border-slate-200",
      )}
      style={{ width: width ?? 224, height: height ?? undefined }}
    >
      {resizable && (
        <NodeResizer isVisible={!!selected} minWidth={224} minHeight={112} handleClassName="border-emerald-500!" lineClassName="border-emerald-500!" />
      )}
      <div className={cn("flex items-center gap-2 rounded-t-xl px-3 py-2", meta.accent)}>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate text-xs font-semibold uppercase tracking-wide">{meta.label}</span>
      </div>
      <div className="px-3 py-2.5">
        <p className="truncate text-sm font-medium text-slate-900">{title}</p>
        {children}
      </div>
    </div>
  );
}

function summary(text?: string, fallback = "Not configured") {
  const t = text?.trim();
  return (
    <p className={cn("mt-0.5 line-clamp-2 text-xs", t ? "text-slate-500" : "italic text-slate-400")}>
      {t || fallback}
    </p>
  );
}

const StartNode = memo(({ data, selected }: NodeProps) => {
  const d = data as { label?: string };
  return (
    <NodeShell kind="start" title={d.label || "Start"} selected={selected} resizable={false}>
      {summary("Flow entry point", "")}
      <Handle type="source" position={Position.Right} className={handleClass} />
    </NodeShell>
  );
});
StartNode.displayName = "StartNode";

const MessageNode = memo(({ data, selected, width, height }: NodeProps) => {
  const d = data as MessageNodeData;
  return (
    <NodeShell kind="message" title={d.label || "Message"} selected={selected} width={width} height={height}>
      {summary(d.text || (d.mediaUrl ? `Media: ${d.mediaType ?? "file"}` : undefined))}
      <Handle type="target" position={Position.Left} className={handleClass} />
      <Handle type="source" position={Position.Right} className={handleClass} />
    </NodeShell>
  );
});
MessageNode.displayName = "MessageNode";

const QuestionNode = memo(({ data, selected, width, height }: NodeProps) => {
  const d = data as QuestionNodeData;
  return (
    <NodeShell kind="question" title={d.label || "Question"} selected={selected} width={width} height={height}>
      {summary(d.question)}
      {d.variable ? (
        <p className="mt-1 inline-block rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">
          → {`{{${d.variable}}}`}
        </p>
      ) : null}
      <Handle type="target" position={Position.Left} className={handleClass} />
      <Handle type="source" position={Position.Right} className={handleClass} />
    </NodeShell>
  );
});
QuestionNode.displayName = "QuestionNode";

const ConditionNode = memo(({ data, selected, width, height }: NodeProps) => {
  const d = data as ConditionNodeData;
  const routes = d.routes ?? [];
  const outputs = [...routes.map((r) => ({ id: r.id, label: r.label || r.variable || "route" })), { id: "else", label: "else" }];
  return (
    <div
      className={cn(
        "min-h-32 min-w-56 rounded-xl border bg-white shadow-md transition",
        selected ? "border-emerald-500 ring-2 ring-emerald-500/30" : "border-slate-200",
      )}
      style={{ width: width ?? 224, height: height ?? undefined }}
    >
      <NodeResizer isVisible={!!selected} minWidth={224} minHeight={128} handleClassName="border-emerald-500!" lineClassName="border-emerald-500!" />
      <div className={cn("flex items-center gap-2 rounded-t-xl px-3 py-2", NODE_META.condition.accent)}>
        <NODEIconCondition />
        <span className="truncate text-xs font-semibold uppercase tracking-wide">Condition</span>
      </div>
      <div className="px-3 py-2.5">
        <p className="truncate text-sm font-medium text-slate-900">{d.label || "Condition"}</p>
        <ul className="mt-1.5 space-y-1">
          {outputs.map((o) => (
            <li key={o.id} className="truncate rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
              {o.label}
            </li>
          ))}
        </ul>
      </div>
      <Handle type="target" position={Position.Left} className={handleClass} />
      {outputs.map((o, i) => (
        <Handle
          key={o.id}
          id={o.id}
          type="source"
          position={Position.Right}
          className={handleClass}
          style={{ top: `${((i + 1) / (outputs.length + 1)) * 100}%` }}
        />
      ))}
    </div>
  );
});
ConditionNode.displayName = "ConditionNode";

function NODEIconCondition() {
  const Icon = NODE_ICON.condition;
  return <Icon className="h-4 w-4 shrink-0" />;
}

const ApiNode = memo(({ data, selected, width, height }: NodeProps) => {
  const d = data as ApiNodeData;
  return (
    <NodeShell kind="api" title={d.label || "API Call"} selected={selected} width={width} height={height}>
      {summary(d.url ? `${d.method ?? "GET"} ${d.url}` : undefined, "No URL set")}
      <Handle type="target" position={Position.Left} className={handleClass} />
      <Handle type="source" position={Position.Right} className={handleClass} />
    </NodeShell>
  );
});
ApiNode.displayName = "ApiNode";

const DelayNode = memo(({ data, selected, width, height }: NodeProps) => {
  const d = data as DelayNodeData;
  return (
    <NodeShell kind="delay" title={d.label || "Delay"} selected={selected} width={width} height={height}>
      {summary(d.seconds ? `Wait ${d.seconds}s` : undefined, "No delay set")}
      <Handle type="target" position={Position.Left} className={handleClass} />
      <Handle type="source" position={Position.Right} className={handleClass} />
    </NodeShell>
  );
});
DelayNode.displayName = "DelayNode";

const HandoffNode = memo(({ data, selected, width, height }: NodeProps) => {
  const d = data as HandoffNodeData;
  return (
    <NodeShell kind="handoff" title={d.label || "Handoff"} selected={selected} width={width} height={height}>
      {summary(d.team || d.department ? `To: ${d.team ?? d.department}${d.queue ? ` / ${d.queue}` : ""}` : "Assign to a human agent")}
      <Handle type="target" position={Position.Left} className={handleClass} />
    </NodeShell>
  );
});
HandoffNode.displayName = "HandoffNode";

const AiNode = memo(({ data, selected, width, height }: NodeProps) => {
  const d = data as AiNodeData;
  return (
    <NodeShell kind="ai" title={d.label || "AI Response"} selected={selected} width={width} height={height}>
      {summary(d.prompt)}
      <Handle type="target" position={Position.Left} className={handleClass} />
      <Handle type="source" position={Position.Right} className={handleClass} />
    </NodeShell>
  );
});
AiNode.displayName = "AiNode";

const EndNode = memo(({ data, selected }: NodeProps) => {
  const d = data as { label?: string };
  return (
    <NodeShell kind="end" title={d.label || "End"} selected={selected} resizable={false}>
      {summary("Flow ends here", "")}
      <Handle type="target" position={Position.Left} className={handleClass} />
    </NodeShell>
  );
});
EndNode.displayName = "EndNode";

/** Stable nodeTypes map — defined at module scope so React Flow never re-registers. */
export const nodeTypes: NodeTypes = {
  start: StartNode,
  message: MessageNode,
  question: QuestionNode,
  condition: ConditionNode,
  api: ApiNode,
  delay: DelayNode,
  handoff: HandoffNode,
  ai: AiNode,
  end: EndNode,
};
