"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Plus,
  Zap,
  MessageSquare,
  HelpCircle,
  GitBranch,
  Webhook,
  UserCheck,
  Play,
  Save,
  ZoomIn,
  ZoomOut,
  Workflow,
  GripVertical,
} from "lucide-react";
import type { ChatbotFlow } from "@prisma/client";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Skeleton,
  inputClass,
} from "@/components/ui";
import { Toggle } from "@/components/ui/Toggle";
import { cn, formatDate } from "@/lib/utils";

// TODO: full flow builder — the canvas below is a static preview. The real editor
// needs drag-drop node placement, edge routing, per-node config panels, and JSON
// persistence into ChatbotFlow.nodes / ChatbotFlow.edges.
// TODO [GAURANSH]: GET/POST /api/chatbot/flows (currently 501).

function useFlows() {
  return useQuery<ChatbotFlow[]>({
    queryKey: ["chatbot-flows"],
    queryFn: async () => {
      const res = await fetch("/api/chatbot/flows");
      if (!res.ok) throw new Error(`Failed to load flows (${res.status})`);
      const json = await res.json();
      return Array.isArray(json) ? json : (json.data ?? []);
    },
    retry: false,
  });
}

const PALETTE = [
  { icon: MessageSquare, label: "Message", hint: "Send text or media", color: "text-emerald-600 bg-emerald-50" },
  { icon: HelpCircle, label: "Question", hint: "Ask and store the reply", color: "text-sky-600 bg-sky-50" },
  { icon: GitBranch, label: "Condition", hint: "Branch on an answer", color: "text-amber-600 bg-amber-50" },
  { icon: Webhook, label: "API Call", hint: "Call an external URL", color: "text-violet-600 bg-violet-50" },
  { icon: UserCheck, label: "Handoff", hint: "Assign to a human agent", color: "text-rose-600 bg-rose-50" },
];

/** A single node drawn on the preview canvas. */
function FlowNode({
  icon: Icon,
  kind,
  title,
  subtitle,
  accent,
  style,
}: {
  icon: React.ComponentType<{ className?: string }>;
  kind: string;
  title: string;
  subtitle: string;
  accent: string;
  style: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className="absolute w-52 cursor-grab rounded-xl border border-slate-200 bg-white shadow-md transition hover:shadow-lg active:cursor-grabbing"
    >
      <div className={cn("flex items-center gap-2 rounded-t-xl px-3 py-2", accent)}>
        <Icon className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">{kind}</span>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-sm font-medium text-slate-900">{title}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{subtitle}</p>
      </div>
      <span className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-white bg-slate-300" />
      <span className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-white bg-slate-300" />
    </div>
  );
}

export default function ChatbotPage() {
  const { data, isLoading, isError } = useFlows();
  const [open, setOpen] = useState(false);
  /** Optimistic overrides only — anything not toggled falls back to the server value. */
  const [localActive, setLocalActive] = useState<Record<string, boolean>>({});

  const flows = data ?? [];

  const nodeCount = (f: ChatbotFlow) => (Array.isArray(f.nodes) ? f.nodes.length : 0);

  return (
    <div>
      <PageHeader
        title="Chatbot"
        description="Automate replies with keyword-triggered conversation flows."
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            New Flow
          </Button>
        }
      />

      {/* ── Flow list ─────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-1/2" />
            </Card>
          ))}
        </div>
      ) : isError || flows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Bot}
            title={isError ? "Flows aren't available yet" : "No chatbot flows yet"}
            description={
              isError
                ? "The chatbot API is still being built. Saved flows will appear here once it's live — the builder below is a preview."
                : "Create a flow to greet customers, qualify them, and hand off to an agent automatically."
            }
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />
                New Flow
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {flows.map((f) => (
            <Card key={f.id} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{f.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                    {f.description || "No description"}
                  </p>
                </div>
                <Toggle
                  checked={localActive[f.id] ?? f.isActive}
                  onChange={(v) => setLocalActive((s) => ({ ...s, [f.id]: v }))}
                  size="sm"
                  label={`Activate ${f.name}`}
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {(f.keywords ?? []).slice(0, 4).map((k) => (
                  <Badge key={k} className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">
                    {k}
                  </Badge>
                ))}
                {(f.keywords?.length ?? 0) === 0 && (
                  <Badge className="bg-slate-100 text-slate-500">No keywords</Badge>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Workflow className="h-3.5 w-3.5" />
                  {nodeCount(f)} nodes
                </span>
                <span>{formatDate(f.createdAt)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Flow builder preview ──────────────────────────────────────────── */}
      <div className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Flow Builder</h2>
            <p className="text-sm text-slate-500">
              Preview of the visual editor — drag-and-drop editing is coming soon.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" aria-label="Zoom out">
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="sm" aria-label="Zoom in">
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="sm">
              <Play className="h-4 w-4" />
              Test
            </Button>
            <Button size="sm" disabled>
              <Save className="h-4 w-4" />
              Save Flow
            </Button>
          </div>
        </div>

        <Card className="flex flex-col overflow-hidden lg:flex-row">
          {/* Palette */}
          <aside className="shrink-0 border-b border-slate-200 bg-slate-50/60 p-4 lg:w-60 lg:border-b-0 lg:border-r">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Node types
            </p>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              {PALETTE.map((p) => (
                <div
                  key={p.label}
                  draggable
                  className="flex cursor-grab items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 shadow-sm transition hover:border-emerald-300 hover:shadow active:cursor-grabbing"
                >
                  <GripVertical className="hidden h-3.5 w-3.5 shrink-0 text-slate-300 lg:block" />
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                      p.color,
                    )}
                  >
                    <p.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">
                      {p.label}
                    </span>
                    <span className="hidden truncate text-[11px] text-slate-400 lg:block">
                      {p.hint}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-4 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-800 ring-1 ring-inset ring-amber-600/20">
              Drag a node onto the canvas to add a step, then connect nodes by dragging between the
              circles on their edges.
            </p>
          </aside>

          {/* Canvas */}
          <div
            className="scrollbar-slim relative min-h-[26rem] flex-1 overflow-x-auto bg-white"
            style={{
              backgroundImage: "radial-gradient(circle, rgb(203 213 225) 1px, transparent 1px)",
              backgroundSize: "18px 18px",
            }}
          >
            <div className="relative h-[26rem] min-w-[56rem]">
              {/* Connector lines */}
              <svg className="absolute inset-0 h-full w-full" aria-hidden>
                <defs>
                  <marker
                    id="flow-arrow"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                  >
                    <path d="M0,0 L8,4 L0,8 Z" fill="rgb(148 163 184)" />
                  </marker>
                </defs>
                {/* Trigger → Message */}
                <path
                  d="M 250 110 C 285 110, 285 110, 318 110"
                  stroke="rgb(148 163 184)"
                  strokeWidth="2"
                  fill="none"
                  markerEnd="url(#flow-arrow)"
                />
                {/* Message → Condition */}
                <path
                  d="M 530 110 C 565 110, 565 110, 598 110"
                  stroke="rgb(148 163 184)"
                  strokeWidth="2"
                  fill="none"
                  markerEnd="url(#flow-arrow)"
                />
                {/* Condition → Handoff action (yes branch) */}
                <path
                  d="M 810 110 C 860 130, 850 300, 700 300"
                  stroke="rgb(148 163 184)"
                  strokeWidth="2"
                  strokeDasharray="5 4"
                  fill="none"
                  markerEnd="url(#flow-arrow)"
                />
                <text x="845" y="215" fill="rgb(100 116 139)" fontSize="11" fontWeight="500">
                  yes
                </text>
                {/* Condition → Self-serve message (no branch) */}
                <path
                  d="M 704 172 C 704 240, 400 230, 342 292"
                  stroke="rgb(203 213 225)"
                  strokeWidth="2"
                  strokeDasharray="5 4"
                  fill="none"
                  markerEnd="url(#flow-arrow)"
                />
                <text x="486" y="236" fill="rgb(148 163 184)" fontSize="11" fontWeight="500">
                  no
                </text>
              </svg>

              <FlowNode
                icon={Zap}
                kind="Trigger"
                title="Keyword: pricing"
                subtitle="Fires when a message contains “pricing”, “cost” or “plan”."
                accent="bg-slate-900 text-white"
                style={{ left: 40, top: 62 }}
              />
              <FlowNode
                icon={MessageSquare}
                kind="Message"
                title="Send plan overview"
                subtitle="“Hi {{name}}! Our plans start at ₹999/mo…”"
                accent="bg-emerald-50 text-emerald-700"
                style={{ left: 320, top: 62 }}
              />
              <FlowNode
                icon={GitBranch}
                kind="Condition"
                title="Budget above ₹5,000?"
                subtitle="Branches on the reply captured in the previous step."
                accent="bg-amber-50 text-amber-800"
                style={{ left: 600, top: 62 }}
              />
              <FlowNode
                icon={UserCheck}
                kind="Action"
                title="Assign to sales agent"
                subtitle="Marks the lead HOT and hands off to a human."
                accent="bg-violet-50 text-violet-700"
                style={{ left: 500, top: 262 }}
              />
              <FlowNode
                icon={MessageSquare}
                kind="Message"
                title="Share self-serve link"
                subtitle="Sends the starter plan checkout link."
                accent="bg-emerald-50 text-emerald-700"
                style={{ left: 140, top: 262 }}
              />
            </div>
          </div>
        </Card>
      </div>

      <NewFlowModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function NewFlowModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/chatbot/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          trigger: "KEYWORD",
          keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
          isActive: active,
          nodes: [],
          edges: [],
        }),
      });
      if (!r.ok) { const j = await r.json(); throw new Error(j.error ?? "Failed to create flow"); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chatbot-flows"] });
      setName(""); setKeywords(""); setDescription(""); setActive(true); setError(null);
      onClose();
    },
    onError: (err) => setError((err as Error).message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Flow"
      description="Give the flow a trigger — the steps are designed on the canvas."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => { e.preventDefault(); setError(null); create.mutate(); }}
      >
        <Field label="Flow name" htmlFor="flow-name" required>
          <input
            id="flow-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Pricing enquiry bot"
          />
        </Field>

        <Field label="Trigger keywords" htmlFor="flow-keywords">
          <input
            id="flow-keywords"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            className={inputClass}
            placeholder="pricing, cost, plan"
          />
          <p className="mt-1.5 text-xs text-slate-500">
            Comma separated. Matching is case-insensitive.
          </p>
        </Field>

        <Field label="Description" htmlFor="flow-description">
          <textarea
            id="flow-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className={cn(inputClass, "resize-y")}
            placeholder="What this flow does…"
          />
        </Field>

        <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
          <span>
            <span className="block text-sm font-medium text-slate-800">Activate immediately</span>
            <span className="block text-xs text-slate-500">
              Start replying as soon as it&apos;s saved.
            </span>
          </span>
          <Toggle checked={active} onChange={setActive} label="Activate immediately" />
        </div>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || create.isPending}>
            {create.isPending ? "Creating…" : "Create Flow"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
