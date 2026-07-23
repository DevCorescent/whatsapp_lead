"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  reconnectEdge,
  useReactFlow,
  MarkerType,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import {
  AlertTriangle,
  Check,
  Cloud,
  Loader2,
  Redo2,
  Rocket,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
  Maximize,
  Play,
  CheckCircle2,
  FileEdit,
  Rows3,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  defaultNodeData,
  toFlowDocument,
  type FlowDocument,
  type NodeKind,
} from "@/lib/chatbot/types";
import type { ChatbotFlow } from "@prisma/client";
import { validateFlow, type ValidationResult } from "@/lib/chatbot/validation";
import { useAutosaveFlow, useDraftFlow, useFlow, usePublishFlow, useValidateFlow } from "@/hooks/useFlows";
import { nodeTypes } from "./FlowNodes";
import { NodePalette, DND_MIME } from "./NodePalette";
import { PropertiesPanel } from "./PropertiesPanel";
import { PreviewPanel } from "./PreviewPanel";
import { useFlowEditor } from "./useFlowEditor";

const AUTOSAVE_MS = 900;

const uid = (p = "n") =>
  `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)}`;

const defaultEdgeOptions = {
  animated: true,
  markerEnd: { type: MarkerType.ArrowClosed },
};

/** Strip React Flow runtime fields down to the serializable shape stored in
 *  ChatbotFlow.nodes / ChatbotFlow.edges. */
function serializeNodes(nodes: Node[]) {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    width: typeof n.width === "number" ? n.width : undefined,
    height: typeof n.height === "number" ? n.height : undefined,
    data: n.data,
  }));
}
function serializeEdges(edges: Edge[]) {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
    label: typeof e.label === "string" ? e.label : undefined,
  }));
}

function ensureStart(nodes: Node[]): Node[] {
  if (nodes.some((n) => n.type === "start")) return nodes;
  return [
    { id: uid("start"), type: "start", position: { x: 80, y: 160 }, data: { label: "Start" } },
    ...nodes,
  ];
}

export function FlowBuilder({
  flowId,
  onClose,
  initialFlow,
  localOnly = false,
}: {
  flowId: string;
  onClose: () => void;
  initialFlow?: ChatbotFlow;
  localOnly?: boolean;
}) {
  return (
    <ReactFlowProvider>
      <FlowCanvas flowId={flowId} onClose={onClose} initialFlow={initialFlow} localOnly={localOnly} />
    </ReactFlowProvider>
  );
}

function FlowCanvas({
  flowId,
  onClose,
  initialFlow,
  localOnly,
}: {
  flowId: string;
  onClose: () => void;
  initialFlow?: ChatbotFlow;
  localOnly: boolean;
}) {
  const { data: remoteFlow, isLoading } = useFlow(localOnly ? null : flowId);
  const flow = initialFlow ?? remoteFlow;
  const autosave = useAutosaveFlow();
  const publish = usePublishFlow();
  const draft = useDraftFlow();
  const validateMutation = useValidateFlow();
  const { screenToFlowPosition, zoomIn, zoomOut, fitView } = useReactFlow();

  const editor = useFlowEditor([], []);
  const { nodes, edges, setNodes, setEdges, onNodesChange, onEdgesChange, takeSnapshot, undo, redo, reset, canUndo, canRedo } = editor;

  const [ready, setReady] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isActive, setIsActive] = useState(false);

  // `savedSig` drives the dirty indicator in render; `savedSigRef` is the same value
  // for use inside callbacks (reading a ref during render is disallowed).
  const [savedSig, setSavedSig] = useState<string>("");
  const savedSigRef = useRef<string>("");
  const inFlightSig = useRef<string>("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clipboard = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const markSaved = useCallback(
    (sig: string) => {
      savedSigRef.current = sig;
      setSavedSig(sig);
      if (localOnly) {
        localStorage.setItem(
          `chatbot-flow-draft:${flowId}`,
          JSON.stringify({ nodes: serializeNodes(nodes), edges: serializeEdges(edges), savedAt: new Date().toISOString() }),
        );
      }
    },
    [edges, flowId, localOnly, nodes],
  );

  // ── Load the stored flow into the canvas once ─────────────────────────────
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!flow || loadedFor.current === flow.id) return;
    loadedFor.current = flow.id;
    const doc = toFlowDocument(flow.nodes, flow.edges);
    const initialNodes = ensureStart(doc.nodes as unknown as Node[]);
    const initialEdges = doc.edges as unknown as Edge[];
    reset(initialNodes, initialEdges);
    const sig = JSON.stringify({ n: serializeNodes(initialNodes), e: serializeEdges(initialEdges) });
    savedSigRef.current = sig;
    setSavedSig(sig);
    setIsActive(flow.isActive);
    setReady(true);
  }, [flow, reset]);

  const currentSig = useMemo(
    () => JSON.stringify({ n: serializeNodes(nodes), e: serializeEdges(edges) }),
    [nodes, edges],
  );
  const dirty = ready && currentSig !== savedSig;

  // ── Debounced autosave (only changed docs, no duplicate in-flight) ─────────
  const doSave = useCallback(
    (sig: string) => {
      if (sig === savedSigRef.current || sig === inFlightSig.current) return;
      if (localOnly) {
        markSaved(sig);
        return;
      }
      inFlightSig.current = sig;
      autosave.mutate(
        { id: flowId, nodes: serializeNodes(nodes), edges: serializeEdges(edges) },
        {
          onSuccess: () => markSaved(sig),
          onSettled: () => {
            inFlightSig.current = "";
          },
        },
      );
    },
    [flowId, nodes, edges, autosave, localOnly, markSaved],
  );

  const saveNow = useCallback(async () => {
    const sig = currentSig;
    if (sig === savedSigRef.current) return;
    if (localOnly) {
      markSaved(sig);
      return;
    }
    inFlightSig.current = sig;
    try {
      await autosave.mutateAsync({ id: flowId, nodes: serializeNodes(nodes), edges: serializeEdges(edges) });
      markSaved(sig);
    } finally {
      inFlightSig.current = "";
    }
  }, [autosave, currentSig, flowId, localOnly, markSaved, nodes, edges]);

  useEffect(() => {
    if (!ready || !dirty) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(currentSig), AUTOSAVE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [currentSig, dirty, ready, doSave]);

  // Snapshot before structural removals (keyboard Delete flows through here);
  // continuous drag/selection changes apply live without touching history.
  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      if (changes.some((c) => c.type === "remove")) takeSnapshot();
      onNodesChange(changes);
    },
    [onNodesChange, takeSnapshot],
  );
  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      if (changes.some((c) => c.type === "remove")) takeSnapshot();
      onEdgesChange(changes);
    },
    [onEdgesChange, takeSnapshot],
  );

  // ── Node/edge operations ──────────────────────────────────────────────────
  const addNode = useCallback(
    (kind: NodeKind, position: { x: number; y: number }) => {
      takeSnapshot();
      const node: Node = { id: uid(kind), type: kind, position, data: { ...defaultNodeData(kind) } };
      setNodes((nds) => nds.concat(node));
    },
    [setNodes, takeSnapshot],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      takeSnapshot();
      const source = nodes.find((n) => n.id === conn.source);
      const route = source?.type === "condition"
        ? ((source.data as { routes?: { id: string; label?: string }[] }).routes ?? []).find((r) => r.id === conn.sourceHandle)
        : null;
      const label = conn.sourceHandle === "else" ? "else" : route?.label;
      setEdges((eds) => addEdge({ ...conn, label, animated: true, markerEnd: { type: MarkerType.ArrowClosed } }, eds));
    },
    [nodes, setEdges, takeSnapshot],
  );

  const edgeReconnectOk = useRef(true);
  const onReconnectStart = useCallback(() => {
    edgeReconnectOk.current = false;
  }, []);
  const onReconnect = useCallback(
    (oldEdge: Edge, newConn: Connection) => {
      edgeReconnectOk.current = true;
      takeSnapshot();
      setEdges((els) => reconnectEdge(oldEdge, newConn, els));
    },
    [setEdges, takeSnapshot],
  );
  const onReconnectEnd = useCallback(
    (_: unknown, edge: Edge) => {
      // Dropping a reconnect in empty space deletes the edge.
      if (!edgeReconnectOk.current) {
        takeSnapshot();
        setEdges((eds) => eds.filter((e) => e.id !== edge.id));
      }
      edgeReconnectOk.current = true;
    },
    [setEdges, takeSnapshot],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData(DND_MIME) as NodeKind;
      if (!kind) return;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNode(kind, position);
    },
    [screenToFlowPosition, addNode],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const updateNodeData = useCallback(
    (id: string, data: Record<string, unknown>) => {
      takeSnapshot();
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data } : n)));
    },
    [setNodes, takeSnapshot],
  );

  const deleteNode = useCallback(
    (id: string) => {
      takeSnapshot();
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    },
    [setNodes, setEdges, takeSnapshot],
  );

  const autoLayout = useCallback(() => {
    takeSnapshot();
    const start = nodes.find((n) => n.type === "start") ?? nodes[0];
    if (!start) return;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const levels = new Map<string, number>([[start.id, 0]]);
    const queue = [start.id];
    while (queue.length) {
      const id = queue.shift()!;
      const level = levels.get(id) ?? 0;
      for (const edge of edges.filter((e) => e.source === id)) {
        if (!byId.has(edge.target) || levels.has(edge.target)) continue;
        levels.set(edge.target, level + 1);
        queue.push(edge.target);
      }
    }
    let fallback = 0;
    const buckets = new Map<number, Node[]>();
    for (const node of nodes) {
      const level = levels.get(node.id) ?? fallback++;
      buckets.set(level, [...(buckets.get(level) ?? []), node]);
    }
    setNodes((nds) =>
      nds.map((node) => {
        const level = levels.get(node.id) ?? [...buckets.entries()].find(([, group]) => group.some((n) => n.id === node.id))?.[0] ?? 0;
        const group = buckets.get(level) ?? [];
        const index = group.findIndex((n) => n.id === node.id);
        return { ...node, position: { x: 80 + level * 300, y: 90 + Math.max(index, 0) * 160 } };
      }),
    );
    requestAnimationFrame(() => fitView({ padding: 0.2 }));
  }, [nodes, edges, setNodes, takeSnapshot, fitView]);

  const duplicateNodes = useCallback(
    (ids: string[]) => {
      const src = nodes.filter((n) => ids.includes(n.id) && n.type !== "start");
      if (src.length === 0) return;
      takeSnapshot();
      const idMap = new Map<string, string>();
      const copies = src.map((n) => {
        const nid = uid(n.type ?? "n");
        idMap.set(n.id, nid);
        return { ...n, id: nid, position: { x: n.position.x + 40, y: n.position.y + 40 }, selected: true, data: JSON.parse(JSON.stringify(n.data)) };
      });
      const innerEdges = edges
        .filter((e) => idMap.has(e.source) && idMap.has(e.target))
        .map((e) => ({ ...e, id: uid("e"), source: idMap.get(e.source)!, target: idMap.get(e.target)! }));
      setNodes((nds) => nds.map((n) => ({ ...n, selected: false })).concat(copies));
      setEdges((eds) => eds.concat(innerEdges));
    },
    [nodes, edges, setNodes, setEdges, takeSnapshot],
  );

  // ── Clipboard (copy / paste) ──────────────────────────────────────────────
  const copySelection = useCallback(() => {
    const sel = nodes.filter((n) => n.selected && n.type !== "start");
    if (sel.length === 0) return;
    const ids = new Set(sel.map((n) => n.id));
    clipboard.current = {
      nodes: JSON.parse(JSON.stringify(sel)),
      edges: JSON.parse(JSON.stringify(edges.filter((e) => ids.has(e.source) && ids.has(e.target)))),
    };
  }, [nodes, edges]);

  const paste = useCallback(() => {
    const clip = clipboard.current;
    if (!clip || clip.nodes.length === 0) return;
    takeSnapshot();
    const idMap = new Map<string, string>();
    const newNodes = clip.nodes.map((n) => {
      const nid = uid(n.type ?? "n");
      idMap.set(n.id, nid);
      return { ...n, id: nid, position: { x: n.position.x + 48, y: n.position.y + 48 }, selected: true };
    });
    const newEdges = clip.edges
      .filter((e) => idMap.has(e.source) && idMap.has(e.target))
      .map((e) => ({ ...e, id: uid("e"), source: idMap.get(e.source)!, target: idMap.get(e.target)! }));
    setNodes((nds) => nds.map((n) => ({ ...n, selected: false })).concat(newNodes));
    setEdges((eds) => eds.concat(newEdges));
  }, [setNodes, setEdges, takeSnapshot]);

  // ── Keyboard shortcuts (ignored while typing) ─────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === "c") {
        copySelection();
      } else if (mod && e.key.toLowerCase() === "v") {
        paste();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateNodes(nodes.filter((n) => n.selected).map((n) => n.id));
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [undo, redo, copySelection, paste, duplicateNodes, nodes]);

  // ── Selection / validation / publish ──────────────────────────────────────
  const selectedNodes = nodes.filter((n) => n.selected);
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : null;

  const runValidation = useCallback(async (): Promise<ValidationResult> => {
    if (localOnly) {
      const local = validateFlow(toFlowDocument(serializeNodes(nodes), serializeEdges(edges)));
      setValidation(local);
      return local;
    }
    // Prefer the server endpoint (authoritative), fall back to the shared lib.
    try {
      const result = await validateMutation.mutateAsync({ id: flowId, nodes: serializeNodes(nodes), edges: serializeEdges(edges) });
      setValidation(result);
      return result;
    } catch {
      const local = validateFlow(toFlowDocument(serializeNodes(nodes), serializeEdges(edges)));
      setValidation(local);
      return local;
    }
  }, [flowId, localOnly, nodes, edges, validateMutation]);

  const setPublished = useCallback(
    async (next: boolean) => {
      if (next) {
        const result = await runValidation();
        if (!result.valid) return; // block publish on errors
        await saveNow();
        if (localOnly) {
          setIsActive(true);
          return;
        }
        await publish.mutateAsync(flowId);
        setIsActive(true);
        return;
      }
      await saveNow();
      if (localOnly) {
        setIsActive(false);
        return;
      }
      await draft.mutateAsync(flowId);
      setIsActive(false);
    },
    [runValidation, saveNow, localOnly, publish, draft, flowId],
  );

  const flowDoc: FlowDocument = useMemo(
    () => toFlowDocument(serializeNodes(nodes), serializeEdges(edges)),
    [nodes, edges],
  );

  const saveState: "saving" | "dirty" | "saved" = autosave.isPending ? "saving" : dirty ? "dirty" : "saved";
  const errorCount = validation?.issues.filter((i) => i.severity === "error").length ?? 0;

  return (
    <div ref={wrapperRef} className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Toolbar */}
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-2.5">
        <button onClick={onClose} aria-label="Back to flows" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{flow?.name ?? "Flow"}{localOnly ? " (local draft)" : ""}</p>
          <SaveIndicator state={saveState} />
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <ToolbarIcon onClick={undo} disabled={!canUndo} label="Undo" icon={Undo2} />
          <ToolbarIcon onClick={redo} disabled={!canRedo} label="Redo" icon={Redo2} />
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <ToolbarIcon onClick={() => zoomOut()} label="Zoom out" icon={ZoomOut} />
          <ToolbarIcon onClick={() => zoomIn()} label="Zoom in" icon={ZoomIn} />
          <ToolbarIcon onClick={() => fitView({ padding: 0.2 })} label="Fit view" icon={Maximize} />
          <ToolbarIcon onClick={autoLayout} label="Auto layout" icon={Rows3} />
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <Button variant="secondary" size="sm" onClick={() => setPreviewOpen(true)}>
            <Play className="h-4 w-4" />
            Test
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void saveNow()} disabled={!dirty || autosave.isPending}>
            <Save className="h-4 w-4" />
            Save
          </Button>
          <Button variant="secondary" size="sm" onClick={runValidation} disabled={validateMutation.isPending}>
            {validateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Validate
          </Button>
          {isActive ? (
            <Button variant="secondary" size="sm" onClick={() => setPublished(false)} disabled={autosave.isPending || draft.isPending}>
              <FileEdit className="h-4 w-4" />
              Unpublish
            </Button>
          ) : (
            <Button size="sm" onClick={() => setPublished(true)} disabled={autosave.isPending || publish.isPending}>
              <Rocket className="h-4 w-4" />
              Publish
            </Button>
          )}
        </div>
      </header>

      {/* Validation banner */}
      {validation && validation.issues.length > 0 && (
        <div className={cn("flex items-start gap-2 border-b px-4 py-2 text-sm", errorCount > 0 ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-800")}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <span className="font-medium">
              {errorCount > 0 ? `${errorCount} error${errorCount === 1 ? "" : "s"} block publishing` : "Flow looks OK — with warnings"}
            </span>
            <ul className="mt-0.5 space-y-0.5">
              {validation.issues.slice(0, 4).map((iss, i) => (
                <li key={i} className="truncate text-xs">• {iss.message}</li>
              ))}
              {validation.issues.length > 4 && <li className="text-xs opacity-70">…and {validation.issues.length - 4} more</li>}
            </ul>
          </div>
          <button onClick={() => setValidation(null)} aria-label="Dismiss" className="rounded p-0.5 hover:bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        <NodePalette onAdd={(kind) => addNode(kind, { x: 260 + Math.random() * 80, y: 140 + Math.random() * 80 })} />

        <div className="relative min-w-0 flex-1" onDrop={onDrop} onDragOver={onDragOver}>
          {(isLoading && !flow) || !ready ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading flow…
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={onConnect}
              onReconnect={onReconnect}
              onReconnectStart={onReconnectStart}
              onReconnectEnd={onReconnectEnd}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onNodeDragStart={takeSnapshot}
              defaultEdgeOptions={defaultEdgeOptions}
              deleteKeyCode={["Backspace", "Delete"]}
              multiSelectionKeyCode={["Meta", "Shift"]}
              selectionKeyCode={["Shift"]}
              selectionOnDrag
              snapToGrid
              snapGrid={[18, 18]}
              fitView
              minZoom={0.15}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="rgb(203 213 225)" />
              <Controls className="shadow-md!" />
              <MiniMap pannable zoomable className="rounded-lg! border! border-slate-200!" nodeStrokeWidth={2} />
            </ReactFlow>
          )}
        </div>

        <PropertiesPanel
          node={selectedNode as never}
          onChange={(id, data) => updateNodeData(id, data as Record<string, unknown>)}
          onDelete={deleteNode}
          onDuplicate={(id) => duplicateNodes([id])}
          onClose={() => setNodes((nds) => nds.map((n) => ({ ...n, selected: false })))}
        />
      </div>

      <PreviewPanel open={previewOpen} onClose={() => setPreviewOpen(false)} doc={flowDoc} />
    </div>
  );
}

function SaveIndicator({ state }: { state: "saving" | "dirty" | "saved" }) {
  if (state === "saving")
    return (
      <span className="flex items-center gap-1 text-[11px] text-slate-400">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
      </span>
    );
  if (state === "dirty")
    return (
      <span className="flex items-center gap-1 text-[11px] text-amber-600">
        <Cloud className="h-3 w-3" /> Unsaved changes
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-[11px] text-emerald-600">
      <Check className="h-3 w-3" /> All changes saved
    </span>
  );
}

function ToolbarIcon({
  onClick,
  disabled,
  label,
  icon: Icon,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
