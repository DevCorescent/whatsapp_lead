"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  Plus,
  Workflow,
  MoreVertical,
  Pencil,
  Copy,
  Trash2,
  Loader2,
} from "lucide-react";
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
  type ChatbotFlowDTO,
} from "@/hooks/useChatbot";

type Banner = { kind: "success" | "error"; text: string } | null;

export default function ChatbotPage() {
  const router = useRouter();
  const { data, isLoading, isError } = useFlows();
  const create = useCreateFlow();
  const update = useUpdateFlow();
  const remove = useDeleteFlow();
  const duplicate = useDuplicateFlow();

  const [newOpen, setNewOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ChatbotFlowDTO | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChatbotFlowDTO | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  const flows = data ?? [];

  const togglePublish = async (flow: ChatbotFlowDTO, next: boolean) => {
    setBanner(null);
    try {
      await update.mutateAsync({ id: flow.id, data: { isActive: next } });
      setBanner({
        kind: "success",
        text: next ? `“${flow.name}” is now published.` : `“${flow.name}” unpublished.`,
      });
    } catch (e) {
      setBanner({ kind: "error", text: e instanceof Error ? e.message : "Could not update flow." });
    }
  };

  const onDuplicate = async (flow: ChatbotFlowDTO) => {
    setBanner(null);
    try {
      await duplicate.mutateAsync(flow.id);
      setBanner({ kind: "success", text: `Duplicated “${flow.name}”.` });
    } catch (e) {
      setBanner({ kind: "error", text: e instanceof Error ? e.message : "Could not duplicate." });
    }
  };

  return (
    <div>
      <PageHeader
        title="Chatbot"
        description="Design automated conversation flows that reply, qualify and hand off to your team."
        action={
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" />
            New Flow
          </Button>
        }
      />

      {banner && (
        <div
          role="status"
          className={cn(
            "mb-4 rounded-lg px-4 py-2.5 text-sm ring-1 ring-inset",
            banner.kind === "success"
              ? "bg-emerald-50 text-emerald-800 ring-emerald-600/20"
              : "bg-rose-50 text-rose-700 ring-rose-600/20",
          )}
        >
          {banner.text}
        </div>
      )}

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
            icon={Bot}
            title="Couldn't load flows"
            description="Something went wrong loading your chatbot flows. Please refresh and try again."
          />
        </Card>
      ) : flows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Bot}
            title="No chatbot flows yet"
            description="Create a flow to greet customers, ask qualifying questions and hand off to an agent automatically."
            action={
              <Button onClick={() => setNewOpen(true)}>
                <Plus className="h-4 w-4" />
                New Flow
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {flows.map((f) => (
            <FlowCard
              key={f.id}
              flow={f}
              onOpen={() => router.push(`/chatbot/${f.id}`)}
              onPublishChange={(next) => togglePublish(f, next)}
              onRename={() => setRenameTarget(f)}
              onDuplicate={() => onDuplicate(f)}
              onDelete={() => setDeleteTarget(f)}
              publishing={update.isPending}
            />
          ))}
        </div>
      )}

      <NewFlowModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreate={async (input) => {
          const flow = await create.mutateAsync(input);
          setNewOpen(false);
          router.push(`/chatbot/${flow.id}`);
        }}
        pending={create.isPending}
      />

      <RenameModal
        flow={renameTarget}
        onClose={() => setRenameTarget(null)}
        onSave={async (name, description) => {
          await update.mutateAsync({ id: renameTarget!.id, data: { name, description } });
          setRenameTarget(null);
        }}
        pending={update.isPending}
      />

      <DeleteModal
        flow={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          await remove.mutateAsync(deleteTarget!.id);
          setDeleteTarget(null);
        }}
        pending={remove.isPending}
      />
    </div>
  );
}

function FlowCard({
  flow,
  onOpen,
  onPublishChange,
  onRename,
  onDuplicate,
  onDelete,
  publishing,
}: {
  flow: ChatbotFlowDTO;
  onOpen: () => void;
  onPublishChange: (next: boolean) => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  publishing: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const nodeCount = Array.isArray(flow.nodes) ? flow.nodes.length : 0;

  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="truncate font-semibold text-slate-900 hover:text-emerald-700">{flow.name}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
            {flow.description || "No description"}
          </p>
        </button>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
            aria-label="Flow actions"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-xl bg-white py-1 shadow-lg ring-1 ring-slate-900/5"
            >
              <MenuItem icon={Pencil} onClick={onRename}>
                Rename
              </MenuItem>
              <MenuItem icon={Copy} onClick={onDuplicate}>
                Duplicate
              </MenuItem>
              <MenuItem icon={Trash2} onClick={onDelete} danger>
                Delete
              </MenuItem>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(flow.keywords ?? []).slice(0, 4).map((k) => (
          <Badge key={k} className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">
            {k}
          </Badge>
        ))}
        {(flow.keywords?.length ?? 0) === 0 && (
          <Badge className="bg-slate-100 text-slate-500">No keywords</Badge>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <Workflow className="h-3.5 w-3.5" />
          {nodeCount} node{nodeCount === 1 ? "" : "s"} · {formatDate(flow.createdAt)}
        </span>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
          {flow.isActive ? "Published" : "Draft"}
          <Toggle
            checked={flow.isActive}
            onChange={onPublishChange}
            size="sm"
            label={`Publish ${flow.name}`}
            disabled={publishing}
          />
        </label>
      </div>
    </Card>
  );
}

function MenuItem({
  icon: Icon,
  onClick,
  danger,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      role="menuitem"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-sm transition hover:bg-slate-50",
        danger ? "text-rose-600 hover:bg-rose-50" : "text-slate-700",
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

function NewFlowModal({
  open,
  onClose,
  onCreate,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { name: string; description?: string; keywords?: string[] }) => Promise<void>;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setKeywords("");
    setDescription("");
    setError(null);
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="New Flow"
      description="Name your flow and its trigger keywords — you'll design the steps next."
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            await onCreate({
              name: name.trim(),
              description: description.trim() || undefined,
              keywords: keywords
                .split(",")
                .map((k) => k.trim())
                .filter(Boolean),
            });
            reset();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not create flow.");
          }
        }}
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
          <p className="mt-1.5 text-xs text-slate-500">Comma separated. Matching is case-insensitive.</p>
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

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || pending}>
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              "Create & open builder"
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RenameModal({
  flow,
  onClose,
  onSave,
  pending,
}: {
  flow: ChatbotFlowDTO | null;
  onClose: () => void;
  onSave: (name: string, description: string) => Promise<void>;
  pending: boolean;
}) {
  return (
    <Modal open={Boolean(flow)} onClose={onClose} title="Rename flow">
      {/* Keyed on the flow id so switching targets re-seeds the inputs. */}
      {flow && (
        <RenameForm
          key={flow.id}
          initialName={flow.name}
          initialDescription={flow.description ?? ""}
          pending={pending}
          onCancel={onClose}
          onSave={onSave}
        />
      )}
    </Modal>
  );
}

function RenameForm({
  initialName,
  initialDescription,
  pending,
  onCancel,
  onSave,
}: {
  initialName: string;
  initialDescription: string;
  pending: boolean;
  onCancel: () => void;
  onSave: (name: string, description: string) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await onSave(name.trim(), description.trim());
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not rename.");
        }
      }}
    >
      <Field label="Flow name" htmlFor="rename-name" required>
        <input
          id="rename-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Description" htmlFor="rename-desc">
        <textarea
          id="rename-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className={cn(inputClass, "resize-y")}
        />
      </Field>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim() || pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

function DeleteModal({
  flow,
  onClose,
  onConfirm,
  pending,
}: {
  flow: ChatbotFlowDTO | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  pending: boolean;
}) {
  return (
    <Modal open={Boolean(flow)} onClose={onClose} title="Delete flow">
      <p className="text-sm text-slate-600">
        Delete <strong>{flow?.name}</strong>? This permanently removes the flow and all of its
        steps. This can&apos;t be undone.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={pending}>
          {pending ? "Deleting…" : "Delete flow"}
        </Button>
      </div>
    </Modal>
  );
}
