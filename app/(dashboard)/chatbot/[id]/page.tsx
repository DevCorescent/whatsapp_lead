"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Save,
  Rocket,
  PowerOff,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Button, Card, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  NODE_META,
  PALETTE_NODE_TYPES,
  defaultNodeData,
  validateFlow,
  cryptoId,
  type FlowNode,
  type FlowEdge,
  type FlowNodeData,
} from "@/lib/chatbot";
import { NODE_ICON } from "@/components/chatbot/nodeIcons";
import { FlowCanvas } from "@/components/chatbot/FlowCanvas";
import { NodeInspector, type AgentOption } from "@/components/chatbot/NodeInspector";
import { useFlow, useUpdateFlow, type ChatbotFlowDTO } from "@/hooks/useChatbot";
import { useTeam } from "@/hooks/useTeam";

export default function FlowEditorPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";
  const { data: flow, isLoading, isError } = useFlow(id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[30rem] w-full" />
      </div>
    );
  }

  if (isError || !flow) {
    return (
      <Card className="p-6 text-sm text-rose-600">
        Couldn&apos;t load this flow. It may have been deleted.
      </Card>
    );
  }

  return <FlowEditor flow={flow} />;
}

function FlowEditor({ flow }: { flow: ChatbotFlowDTO }) {
  const router = useRouter();
  const update = useUpdateFlow();
  const { data: teamRes } = useTeam();

  const agents: AgentOption[] = useMemo(() => {
    const members = (teamRes as { data?: { id: string; name: string }[] } | undefined)?.data ?? [];
    return members.map((m) => ({ id: m.id, name: m.name }));
  }, [teamRes]);

  const [nodes, setNodes] = useState<FlowNode[]>(() =>
    Array.isArray(flow.nodes) ? (flow.nodes as FlowNode[]) : [],
  );
  const [edges, setEdges] = useState<FlowEdge[]>(() =>
    Array.isArray(flow.edges) ? (flow.edges as FlowEdge[]) : [],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<{ source: string; handle: string } | null>(null);
  const [banner, setBanner] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Snapshot of what's saved, to drive the dirty indicator. Kept in state (not a
  // ref) so it can be safely read during render and updates re-derive `dirty`.
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify({ nodes, edges }));
  const dirty = JSON.stringify({ nodes, edges }) !== savedSnapshot;

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;
  const validation = useMemo(() => validateFlow(nodes, edges), [nodes, edges]);

  // ── Node/edge mutations ─────────────────────────────────────────────────────

  const addNode = (type: FlowNode["type"]) => {
    const node: FlowNode = {
      id: `n_${cryptoId()}`,
      type,
      // Stagger new nodes so they don't stack exactly on top of each other.
      position: { x: 360 + (nodes.length % 5) * 32, y: 100 + (nodes.length % 8) * 48 },
      data: defaultNodeData(type),
    };
    setNodes((ns) => [...ns, node]);
    setSelectedId(node.id);
  };

  const moveNode = (nodeId: string, pos: { x: number; y: number }) =>
    setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, position: pos } : n)));

  const deleteNode = (nodeId: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== nodeId));
    setEdges((es) => es.filter((e) => e.source !== nodeId && e.target !== nodeId));
    if (selectedId === nodeId) setSelectedId(null);
    if (connecting?.source === nodeId) setConnecting(null);
  };

  const patchNodeData = (nodeId: string, patch: Partial<FlowNodeData>) => {
    setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)));
    // If a button was removed, drop any edge that dangled off its now-gone handle.
    if ("buttons" in patch) {
      const validHandles = new Set((patch.buttons ?? []).map((b) => b.id));
      setEdges((es) =>
        es.filter((e) => e.source !== nodeId || !e.sourceHandle || validHandles.has(e.sourceHandle)),
      );
    }
  };

  const startConnect = (source: string, handle: string) => setConnecting({ source, handle });

  const completeConnect = (target: string) => {
    if (!connecting || connecting.source === target) {
      setConnecting(null);
      return;
    }
    const { source, handle } = connecting;
    setEdges((es) => [
      // A handle drives a single destination, so replace any existing edge from it.
      ...es.filter((e) => !(e.source === source && e.sourceHandle === handle)),
      { id: `e_${cryptoId()}`, source, target, sourceHandle: handle },
    ]);
    setConnecting(null);
  };

  const deleteEdge = (edgeId: string) => setEdges((es) => es.filter((e) => e.id !== edgeId));

  // ── Persistence ─────────────────────────────────────────────────────────────

  const save = async () => {
    setBanner(null);
    try {
      await update.mutateAsync({ id: flow.id, data: { nodes, edges } });
      setSavedSnapshot(JSON.stringify({ nodes, edges }));
      setBanner({ kind: "success", text: "Flow saved." });
    } catch (e) {
      setBanner({ kind: "error", text: e instanceof Error ? e.message : "Could not save." });
    }
  };

  const publish = async () => {
    setBanner(null);
    try {
      await update.mutateAsync({ id: flow.id, data: { nodes, edges, isActive: true } });
      setSavedSnapshot(JSON.stringify({ nodes, edges }));
      setBanner({ kind: "success", text: "Flow published — it's now live." });
    } catch (e) {
      setBanner({ kind: "error", text: e instanceof Error ? e.message : "Could not publish." });
    }
  };

  const unpublish = async () => {
    setBanner(null);
    try {
      await update.mutateAsync({ id: flow.id, data: { isActive: false } });
      setBanner({ kind: "success", text: "Flow unpublished." });
    } catch (e) {
      setBanner({ kind: "error", text: e instanceof Error ? e.message : "Could not unpublish." });
    }
  };

  const published = flow.isActive;

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button
          onClick={() => router.push("/chatbot")}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Flows
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-slate-900">{flow.name}</h1>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
            published
              ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
              : "bg-slate-100 text-slate-500 ring-slate-500/20",
          )}
        >
          {published ? "Published" : "Draft"}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
          <Button variant="secondary" onClick={save} disabled={update.isPending}>
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
          {published ? (
            <Button variant="secondary" onClick={unpublish} disabled={update.isPending}>
              <PowerOff className="h-4 w-4" />
              Unpublish
            </Button>
          ) : (
            <Button onClick={publish} disabled={update.isPending || !validation.ok}>
              <Rocket className="h-4 w-4" />
              Publish
            </Button>
          )}
        </div>
      </div>

      {banner && (
        <div
          role="status"
          className={cn(
            "mb-3 rounded-lg px-4 py-2 text-sm ring-1 ring-inset",
            banner.kind === "success"
              ? "bg-emerald-50 text-emerald-800 ring-emerald-600/20"
              : "bg-rose-50 text-rose-700 ring-rose-600/20",
          )}
        >
          {banner.text}
        </div>
      )}

      {/* Editor body */}
      <Card className="flex min-h-0 flex-1 overflow-hidden p-0">
        {/* Palette */}
        <aside className="hidden w-52 shrink-0 flex-col border-r border-slate-200 bg-slate-50/60 p-3 md:flex">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Add a step
          </p>
          <div className="space-y-1.5">
            {PALETTE_NODE_TYPES.map((type) => {
              const meta = NODE_META[type];
              const Icon = NODE_ICON[type];
              return (
                <button
                  key={type}
                  onClick={() => addNode(type)}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left shadow-sm transition hover:border-emerald-300 hover:shadow"
                >
                  <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", meta.accent)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">
                      {meta.label}
                    </span>
                  </span>
                  <Plus className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-300" />
                </button>
              );
            })}
          </div>

          <ValidationPanel validation={validation} />
        </aside>

        {/* Canvas */}
        <div className="min-w-0 flex-1">
          <FlowCanvas
            nodes={nodes}
            edges={edges}
            selectedId={selectedId}
            connecting={connecting}
            onSelect={setSelectedId}
            onMoveNode={moveNode}
            onStartConnect={startConnect}
            onCompleteConnect={completeConnect}
            onCancelConnect={() => setConnecting(null)}
            onDeleteNode={deleteNode}
            onDeleteEdge={deleteEdge}
          />
        </div>

        {/* Inspector */}
        <aside className="hidden w-72 shrink-0 border-l border-slate-200 bg-white lg:block">
          {selectedNode ? (
            <NodeInspector
              key={selectedNode.id}
              node={selectedNode}
              agents={agents}
              onPatch={(patch) => patchNodeData(selectedNode.id, patch)}
              onDelete={() => deleteNode(selectedNode.id)}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center text-sm text-slate-400">
              <p>Select a node to edit it, or add a step from the palette.</p>
              <p className="mt-2 text-xs">
                Drag the circle on a node&apos;s right edge onto another node to connect them.
              </p>
            </div>
          )}
        </aside>
      </Card>
    </div>
  );
}

function ValidationPanel({ validation }: { validation: ReturnType<typeof validateFlow> }) {
  return (
    <div className="mt-auto pt-4">
      {validation.ok && validation.warnings.length === 0 ? (
        <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-2 text-xs text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Flow is valid and ready to publish.
        </p>
      ) : (
        <div className="space-y-1.5">
          {validation.errors.map((issue, i) => (
            <p
              key={`e${i}`}
              className="flex items-start gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] leading-snug text-rose-700 ring-1 ring-inset ring-rose-600/20"
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {issue.message}
            </p>
          ))}
          {validation.warnings.map((issue, i) => (
            <p
              key={`w${i}`}
              className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-800 ring-1 ring-inset ring-amber-600/20"
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {issue.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
