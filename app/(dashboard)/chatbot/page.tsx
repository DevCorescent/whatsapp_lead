"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Plus,
  Workflow,
  Pencil,
  Copy,
  Trash2,
  MoreHorizontal,
  WifiOff,
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
import {
  useFlows,
  useCreateFlow,
  useUpdateFlow,
  useDeleteFlow,
  useDuplicateFlow,
} from "@/hooks/useFlows";
import { FlowBuilder } from "@/components/chatbot/FlowBuilder";

export default function ChatbotPage() {
  const { data, isLoading, isError } = useFlows();
  const updateFlow = useUpdateFlow();
  const duplicateFlow = useDuplicateFlow();
  const deleteFlow = useDeleteFlow();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [localDraft, setLocalDraft] = useState<ChatbotFlow | null>(null);
  /** Optimistic active toggles; anything untouched falls back to the server value. */
  const [localActive, setLocalActive] = useState<Record<string, boolean>>({});

  const flows = data ?? [];
  const nodeCount = (f: ChatbotFlow) => (Array.isArray(f.nodes) ? f.nodes.length : 0);

  function toggleActive(f: ChatbotFlow, next: boolean) {
    setLocalActive((s) => ({ ...s, [f.id]: next }));
    updateFlow.mutate(
      { id: f.id, data: { isActive: next } },
      { onSettled: () => qc.invalidateQueries({ queryKey: ["chatbot-flows"] }) },
    );
  }

  function openLocalBuilder(input?: { name?: string; description?: string; keywords?: string[] }) {
    const now = new Date();
    const flow = {
      id: `local-${Date.now()}`,
      tenantId: "local",
      name: input?.name?.trim() || "Local chatbot draft",
      description: input?.description?.trim() || "Unsaved local draft",
      trigger: "KEYWORD",
      keywords: input?.keywords ?? [],
      nodes: [],
      edges: [],
      isActive: false,
      createdAt: now,
      updatedAt: now,
    } satisfies ChatbotFlow;
    setLocalDraft(flow);
    setEditingId(flow.id);
  }

  // Full-screen builder overlay.
  if (editingId) {
    const localOnly = localDraft?.id === editingId;
    return (
      <FlowBuilder
        flowId={editingId}
        initialFlow={localOnly ? localDraft : undefined}
        localOnly={localOnly}
        onClose={() => setEditingId(null)}
      />
    );
  }

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
      ) : isError ? (
        <Card>
          <EmptyState
            icon={WifiOff}
            title="Database is temporarily unreachable"
            description="You can still design and test a chatbot locally. Saving to the server will work again when the database connection is restored."
            action={
              <Button onClick={() => openLocalBuilder()}>
                <Plus className="h-4 w-4" />
                Open local builder
              </Button>
            }
          />
        </Card>
      ) : flows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Bot}
            title="No chatbot flows yet"
            description="Create a flow to greet customers, qualify them, and hand off to an agent automatically."
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
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setEditingId(f.id)}
                >
                  <p className="truncate font-semibold text-slate-900">{f.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                    {f.description || "No description"}
                  </p>
                </button>
                <div className="flex items-center gap-1">
                  <Toggle
                    checked={localActive[f.id] ?? f.isActive}
                    onChange={(v) => toggleActive(f, v)}
                    size="sm"
                    label={`Activate ${f.name}`}
                  />
                  <div className="relative">
                    <button
                      onClick={() => setMenuId(menuId === f.id ? null : f.id)}
                      aria-label="Flow actions"
                      className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {menuId === f.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} aria-hidden />
                        <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                          <MenuItem icon={Pencil} label="Open builder" onClick={() => { setMenuId(null); setEditingId(f.id); }} />
                          <MenuItem
                            icon={Copy}
                            label="Duplicate"
                            onClick={() => { setMenuId(null); duplicateFlow.mutate(f.id); }}
                          />
                          <MenuItem
                            icon={Trash2}
                            label="Delete"
                            danger
                            onClick={() => { setMenuId(null); setDeletingId(f.id); }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
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
                <span className="flex items-center gap-2">
                  {(localActive[f.id] ?? f.isActive) && (
                    <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">Live</Badge>
                  )}
                  {formatDate(f.createdAt)}
                </span>
              </div>

              <Button variant="secondary" size="sm" className="mt-3" onClick={() => setEditingId(f.id)}>
                <Pencil className="h-3.5 w-3.5" />
                Open builder
              </Button>
            </Card>
          ))}
        </div>
      )}

      <NewFlowModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={(id) => { setOpen(false); setEditingId(id); }}
        onLocalDraft={(input) => { setOpen(false); openLocalBuilder(input); }}
      />

      <Modal
        open={!!deletingId}
        onClose={() => setDeletingId(null)}
        title="Delete flow?"
        description="This permanently removes the flow and its nodes. This cannot be undone."
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => setDeletingId(null)}>Cancel</Button>
          <Button
            variant="danger"
            disabled={deleteFlow.isPending}
            onClick={() => {
              if (deletingId) deleteFlow.mutate(deletingId, { onSettled: () => setDeletingId(null) });
            }}
          >
            {deleteFlow.isPending ? "Deleting…" : "Delete flow"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-slate-50",
        danger ? "text-rose-600 hover:bg-rose-50" : "text-slate-700",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function NewFlowModal({
  open,
  onClose,
  onCreated,
  onLocalDraft,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
  onLocalDraft: (input: { name: string; description?: string; keywords: string[] }) => void;
}) {
  const create = useCreateFlow();
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = {
      name: name.trim(),
      description: description.trim() || undefined,
      trigger: "KEYWORD",
      keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
      isActive: false,
    };
    create.mutate(
      input,
      {
        onSuccess: (flow) => {
          setName(""); setKeywords(""); setDescription(""); setError(null);
          onCreated(flow.id);
        },
        onError: () => {
          setName(""); setKeywords(""); setDescription(""); setError(null);
          onLocalDraft(input);
        },
      },
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Flow"
      description="Give the flow a trigger — then design the steps on the canvas."
    >
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Flow name" htmlFor="flow-name" required>
          <input id="flow-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Pricing enquiry bot" />
        </Field>

        <Field label="Trigger keywords" htmlFor="flow-keywords">
          <input id="flow-keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)} className={inputClass} placeholder="pricing, cost, plan" />
          <p className="mt-1.5 text-xs text-slate-500">Comma separated. Matching is case-insensitive.</p>
        </Field>

        <Field label="Description" htmlFor="flow-description">
          <textarea id="flow-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={cn(inputClass, "resize-y")} placeholder="What this flow does…" />
        </Field>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!name.trim() || create.isPending}>
            {create.isPending ? "Creating…" : "Create & open builder"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
