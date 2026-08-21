"use client";

import { memo } from "react";
import { Handle, NodeResizer, Position, type NodeProps, type NodeTypes } from "@xyflow/react";
import { cn } from "@/lib/utils";
import {
  NODE_META,
  type NodeKind,
  type MessageNodeData,
  type QuestionNodeData,
  type MenuNodeData,
  type ConditionNodeData,
  type ApiNodeData,
  type DelayNodeData,
  type TemplateNodeData,
  type SetVariableNodeData,
  type HandoffNodeData,
  type AiNodeData,
} from "@/lib/chatbot/types";
import { NODE_ICON } from "./nodeMeta";
import { NAV_AGENT, NAV_BACK, NAV_HOME } from "@/lib/chatbot/menu";

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

const TRIGGER_HINT: Record<string, string> = {
  KEYWORD: "Keyword match",
  INBOUND: "Any inbound message",
  FIRST_MESSAGE: "First message from contact",
};

const StartNode = memo(({ data, selected }: NodeProps) => {
  const d = data as { label?: string; triggerType?: string };
  const hint = TRIGGER_HINT[d.triggerType ?? "KEYWORD"] ?? "Keyword match";
  return (
    <NodeShell kind="start" title={d.label || "Start"} selected={selected} resizable={false}>
      {summary(hint, "")}
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
  // Derived for the same reason as the menu's: NodeResizer fixes the height on
  // mount at whatever minHeight says, so a constant meant a fifth route painted
  // itself outside the card.
  const minHeight = Math.max(128, 96 + outputs.length * 24);
  return (
    <div
      className={cn(
        "min-w-56 rounded-xl border bg-white shadow-md transition",
        selected ? "border-emerald-500 ring-2 ring-emerald-500/30" : "border-slate-200",
      )}
      style={{ width: width ?? 224, height: height ?? undefined, minHeight }}
    >
      <NodeResizer isVisible={!!selected} minWidth={224} minHeight={minHeight} handleClassName="border-emerald-500!" lineClassName="border-emerald-500!" />
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

const TemplateNode = memo(({ data, selected, width, height }: NodeProps) => {
  const d = data as TemplateNodeData;
  return (
    <NodeShell kind="template" title={d.label || "Send Template"} selected={selected} width={width} height={height}>
      {summary(d.templateName ? `${d.templateName} (${d.language ?? "en"})` : undefined, "No template set")}
      {(d.bodyVars?.length ?? 0) > 0 && (
        <p className="mt-1 text-[11px] text-slate-400">{d.bodyVars!.length} variable{d.bodyVars!.length > 1 ? "s" : ""}</p>
      )}
      <Handle type="target" position={Position.Left} className={handleClass} />
      <Handle type="source" position={Position.Right} className={handleClass} />
    </NodeShell>
  );
});
TemplateNode.displayName = "TemplateNode";

const SetVariableNode = memo(({ data, selected, width, height }: NodeProps) => {
  const d = data as SetVariableNodeData;
  return (
    <NodeShell kind="set_variable" title={d.label || "Set Variable"} selected={selected} width={width} height={height}>
      {summary(d.variable ? `{{${d.variable}}} = ${d.value || "…"}` : undefined, "Not configured")}
      <Handle type="target" position={Position.Left} className={handleClass} />
      <Handle type="source" position={Position.Right} className={handleClass} />
    </NodeShell>
  );
});
SetVariableNode.displayName = "SetVariableNode";

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


/**
 * A menu node draws one output handle per option — the IVR branch points.
 *
 * Handle ids are the option ids, which is what lets the engine follow a tap
 * straight to an edge. Renaming an option label must therefore never move a
 * wire, and it does not.
 *
 * The layout is measured rather than proportional. NodeResizer fixes a node's
 * height on mount at whatever `minHeight` says, so a card sized for three rows
 * painted its fourth and fifth outside itself the moment you added the ways out.
 * The height is now derived from the row count, and each handle is placed at the
 * exact centre of the row it belongs to — so the dot you drag from is always
 * beside the option it branches on, at any card size.
 */

/** Layout constants, in px. Shared by the height calculation and the handles. */
const MENU_HEADER_H = 36;
const MENU_BODY_PAD = 10;
const MENU_LABEL_H = 20;
const MENU_PROMPT_H = 32;
const MENU_LIST_GAP = 6;
const MENU_ROW_H = 20;
const MENU_ROW_GAP = 4;
const MENU_ROW_PITCH = MENU_ROW_H + MENU_ROW_GAP;
/** Distance from the top of the card to the middle of the first row. */
const MENU_FIRST_ROW_MID =
  MENU_HEADER_H + MENU_BODY_PAD + MENU_LABEL_H + MENU_PROMPT_H + MENU_LIST_GAP + MENU_ROW_H / 2;

const MenuNode = memo(({ data, selected, width, height }: NodeProps) => {
  const d = data as MenuNodeData;
  const options = (d.options ?? []).filter((o) => o.id);

  // Rows that branch, in the order they are drawn. The no-match row appears only
  // when the author chose to route it, because a handle with no meaning behind
  // it is a wire waiting to be attached to nothing.
  const branching = [
    ...options.map((o) => ({ id: o.id, label: o.label || "Option" })),
    ...(d.fallback === "branch" ? [{ id: "no_match", label: "No match" }] : []),
  ];

  // Ways out are drawn but get no handle: the engine resolves them (pop the
  // stack, restart, hand off) rather than following an edge the author wired.
  const nav: { id: string; label: string }[] = [];
  if (d.showBack) nav.push({ id: NAV_BACK, label: d.backLabel || "◀ Back" });
  if (d.showHome) nav.push({ id: NAV_HOME, label: d.homeLabel || "🏠 Main menu" });
  if (d.showAgent) nav.push({ id: NAV_AGENT, label: d.agentLabel || "💬 Talk to a person" });

  const rowCount = branching.length + nav.length;
  const minHeight = MENU_FIRST_ROW_MID + MENU_ROW_H / 2 + Math.max(0, rowCount - 1) * MENU_ROW_PITCH + MENU_BODY_PAD;

  return (
    <div
      className={cn(
        "relative min-w-56 rounded-xl border bg-white shadow-md transition",
        selected ? "border-emerald-500 ring-2 ring-emerald-500/30" : "border-slate-200",
      )}
      style={{ width: width ?? 240, height: height ?? undefined, minHeight }}
    >
      <NodeResizer
        isVisible={!!selected}
        minWidth={240}
        // Derived, not a constant: a menu that has grown must not be shrinkable
        // back into clipping its own options.
        minHeight={minHeight}
        handleClassName="border-emerald-500!"
        lineClassName="border-emerald-500!"
      />

      {/* The clip lives on an inner wrapper so a manually shrunk card cuts its
          content cleanly — while the handles, which sit outside the card edge,
          stay visible. */}
      <div className="h-full overflow-hidden rounded-xl">
        <div
          className={cn("flex items-center gap-2 px-3", NODE_META.menu.accent)}
          style={{ height: MENU_HEADER_H }}
        >
          <NODEIconMenu />
          <span className="truncate text-xs font-semibold uppercase tracking-wide">Menu</span>
        </div>

        <div className="px-3" style={{ paddingTop: MENU_BODY_PAD, paddingBottom: MENU_BODY_PAD }}>
          <p
            className="truncate text-sm font-medium leading-5 text-slate-900"
            style={{ height: MENU_LABEL_H }}
          >
            {d.label || "Menu"}
          </p>
          {/* Fixed height whether or not there is a prompt, so the first row —
              and therefore every handle — sits at the same offset either way. */}
          <p
            className={cn(
              "line-clamp-2 overflow-hidden text-[11px] leading-4",
              d.prompt ? "text-slate-500" : "italic text-slate-400",
            )}
            style={{ height: MENU_PROMPT_H }}
          >
            {d.prompt || "No prompt set"}
          </p>

          <ul style={{ marginTop: MENU_LIST_GAP }}>
            {branching.map((o, i) => (
              <li
                key={o.id}
                className="truncate rounded bg-fuchsia-50 px-1.5 text-[11px] font-medium leading-5 text-fuchsia-800"
                style={{ height: MENU_ROW_H, marginTop: i === 0 ? 0 : MENU_ROW_GAP }}
              >
                {o.label}
              </li>
            ))}
            {nav.map((o, i) => (
              <li
                key={o.id}
                className="truncate rounded bg-slate-50 px-1.5 text-[11px] leading-5 text-slate-500"
                style={{
                  height: MENU_ROW_H,
                  marginTop: branching.length === 0 && i === 0 ? 0 : MENU_ROW_GAP,
                }}
              >
                {o.label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Handle type="target" position={Position.Left} className={handleClass} />
      {branching.map((o, i) => (
        <Handle
          key={o.id}
          id={o.id}
          type="source"
          position={Position.Right}
          className={handleClass}
          // Pinned to its row rather than spread evenly down the card, so the dot
          // you drag from is unmistakably the option beside it.
          style={{ top: MENU_FIRST_ROW_MID + i * MENU_ROW_PITCH, transform: "translateY(-50%)" }}
        />
      ))}
    </div>
  );
});
MenuNode.displayName = "MenuNode";

function NODEIconMenu() {
  const Icon = NODE_ICON.menu;
  return <Icon className="h-4 w-4 shrink-0" />;
}

/** Stable nodeTypes map — defined at module scope so React Flow never re-registers. */
export const nodeTypes: NodeTypes = {
  start: StartNode,
  message: MessageNode,
  template: TemplateNode,
  question: QuestionNode,
  menu: MenuNode,
  condition: ConditionNode,
  api: ApiNode,
  delay: DelayNode,
  set_variable: SetVariableNode,
  handoff: HandoffNode,
  ai: AiNode,
  end: EndNode,
};
