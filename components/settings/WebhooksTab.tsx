"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Copy, RefreshCw, Webhook, Key, ChevronDown, ChevronUp, CheckCircle2, XCircle, Circle } from "lucide-react";
import { useToast } from "@/components/ui/toast";

const WEBHOOK_EVENTS = [
  { key: "campaign.completed", label: "Campaign Completed" },
  { key: "campaign.failed", label: "Campaign Failed" },
  { key: "message.received", label: "Message Received" },
  { key: "contact.created", label: "Contact Created" },
  { key: "contact.updated", label: "Contact Updated" },
  { key: "broadcast.completed", label: "Broadcast Completed" },
];

interface Endpoint {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  isActive: boolean;
  createdAt: string;
  _count: { deliveries: number };
}

interface Delivery {
  id: string;
  event: string;
  statusCode: number | null;
  error: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

// ── API key section ──────────────────────────────────────────────────────────

function ApiKeySection() {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const { data } = useQuery<{ hasKey: boolean; maskedKey: string | null }>({
    queryKey: ["webhooks-apikey"],
    queryFn: () => fetch("/api/webhooks/apikey").then((r) => r.json()),
  });

  const generate = useMutation({
    mutationFn: () => fetch("/api/webhooks/apikey", { method: "POST" }).then((r) => r.json()),
    onSuccess: (res) => {
      if (res.success) {
        setRevealedKey(res.apiKey);
        qc.invalidateQueries({ queryKey: ["webhooks-apikey"] });
        showToast("New API key generated. Copy it now — it won't be shown again.", "success");
      } else {
        showToast(res.error ?? "Failed to generate key", "error");
      }
    },
  });

  const revoke = useMutation({
    mutationFn: () => fetch("/api/webhooks/apikey", { method: "DELETE" }).then((r) => r.json()),
    onSuccess: (res) => {
      if (res.success) {
        setRevealedKey(null);
        qc.invalidateQueries({ queryKey: ["webhooks-apikey"] });
        showToast("API key revoked.", "info");
      } else {
        showToast(res.error ?? "Failed to revoke", "error");
      }
    },
  });

  function copyKey() {
    if (!revealedKey) return;
    navigator.clipboard.writeText(revealedKey).then(() => showToast("Copied!", "success"));
  }

  const displayKey = revealedKey ?? data?.maskedKey;

  return (
    <section className="rounded-lg border border-slate-200 p-5">
      <div className="mb-3 flex items-center gap-2">
        <Key className="h-4 w-4 text-slate-500" />
        <h3 className="font-semibold text-slate-800">Incoming API Key</h3>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Use this key to authenticate requests to{" "}
        <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">/api/v1/*</code> from your CRM or
        external systems.
        <br />
        Pass it as{" "}
        <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">Authorization: Bearer &lt;key&gt;</code>.
      </p>

      {displayKey ? (
        <div className="mb-3 flex items-center gap-2">
          <code className="flex-1 rounded border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700 break-all">
            {displayKey}
          </code>
          {revealedKey && (
            <button
              onClick={copyKey}
              className="rounded-md border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              title="Copy key"
            >
              <Copy className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : null}

      {revealedKey && (
        <p className="mb-3 text-xs text-amber-600">
          Save this key now — it will not be shown again after you leave this page.
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
          className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${generate.isPending ? "animate-spin" : ""}`} />
          {data?.hasKey ? "Regenerate" : "Generate Key"}
        </button>
        {data?.hasKey && (
          <button
            onClick={() => revoke.mutate()}
            disabled={revoke.isPending}
            className="flex items-center gap-1.5 rounded-md border border-rose-200 px-3 py-1.5 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Revoke
          </button>
        )}
      </div>
    </section>
  );
}

// ── Endpoint row ─────────────────────────────────────────────────────────────

function EndpointRow({
  ep,
  onDelete,
  onToggle,
}: {
  ep: Endpoint;
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: detail } = useQuery<{ deliveries: Delivery[] }>({
    queryKey: ["webhook-deliveries", ep.id],
    queryFn: () => fetch(`/api/webhooks/${ep.id}`).then((r) => r.json()),
    enabled: open,
  });

  return (
    <div className="rounded-lg border border-slate-200">
      <div className="flex items-start gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex h-2 w-2 rounded-full ${ep.isActive ? "bg-emerald-500" : "bg-slate-300"}`}
            />
            <span className="font-mono text-sm text-slate-800 truncate">{ep.url}</span>
          </div>
          {ep.description && (
            <p className="mt-0.5 text-xs text-slate-500">{ep.description}</p>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {ep.events.map((e) => (
              <span
                key={e}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
              >
                {e}
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => onToggle(ep.id, !ep.isActive)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${ep.isActive ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}
          >
            {ep.isActive ? "Disable" : "Enable"}
          </button>
          <button
            onClick={() => onDelete(ep.id)}
            className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
            title="Delete endpoint"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"
            title="Delivery log"
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-200 p-4">
          <p className="mb-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Last 20 deliveries</p>
          {!detail?.deliveries?.length ? (
            <p className="text-sm text-slate-400">No deliveries yet.</p>
          ) : (
            <div className="space-y-1">
              {detail.deliveries.map((d) => (
                <div key={d.id} className="flex items-center gap-3 rounded px-2 py-1.5 hover:bg-slate-50">
                  {d.deliveredAt ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  ) : d.error ? (
                    <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                  )}
                  <span className="font-mono text-xs text-slate-500 shrink-0">
                    {d.statusCode ?? "—"}
                  </span>
                  <span className="text-xs text-slate-600 flex-1 truncate">{d.event}</span>
                  {d.error && (
                    <span className="text-xs text-rose-500 truncate max-w-[160px]">{d.error}</span>
                  )}
                  <span className="text-xs text-slate-400 shrink-0">
                    {new Date(d.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Add endpoint form ────────────────────────────────────────────────────────

function AddEndpointForm({ onAdded }: { onAdded: () => void }) {
  const { showToast } = useToast();
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [revealSecret, setRevealSecret] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (body: object) =>
      fetch("/api/webhooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: (res) => {
      if (res.success) {
        setRevealSecret(res.endpoint.secret);
        setUrl("");
        setDescription("");
        setEvents([]);
        showToast("Webhook endpoint added.", "success");
        onAdded();
      } else {
        showToast(res.error ?? "Failed to add endpoint", "error");
      }
    },
  });

  function toggle(e: string) {
    setEvents((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  }

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!url) { showToast("URL is required", "error"); return; }
    if (!events.length) { showToast("Select at least one event", "error"); return; }
    create.mutate({ url, description, events });
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-slate-200 p-5 space-y-4">
      <h3 className="font-medium text-slate-800">Add Endpoint</h3>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">URL</label>
        <input
          type="url"
          placeholder="https://your-crm.com/webhooks/whatscrm"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Description (optional)</label>
        <input
          type="text"
          placeholder="e.g. My CRM webhook"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">Events to subscribe</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {WEBHOOK_EVENTS.map((ev) => (
            <label key={ev.key} className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={events.includes(ev.key)}
                onChange={() => toggle(ev.key)}
                className="h-3.5 w-3.5 accent-emerald-600"
              />
              <span className="text-sm text-slate-700">{ev.label}</span>
            </label>
          ))}
        </div>
      </div>

      {revealSecret && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
          <p className="mb-1 text-xs font-medium text-amber-800">Signing Secret — save now, won&apos;t be shown again</p>
          <code className="block break-all font-mono text-xs text-amber-900">{revealSecret}</code>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(revealSecret);
              showToast("Secret copied!", "success");
            }}
            className="mt-2 flex items-center gap-1 text-xs text-amber-700 hover:underline"
          >
            <Copy className="h-3 w-3" /> Copy
          </button>
        </div>
      )}

      <button
        type="submit"
        disabled={create.isPending}
        className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        <Plus className="h-4 w-4" />
        {create.isPending ? "Adding…" : "Add Endpoint"}
      </button>
    </form>
  );
}

// ── Main tab ─────────────────────────────────────────────────────────────────

export function WebhooksTab() {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data, isLoading } = useQuery<{ endpoints: Endpoint[] }>({
    queryKey: ["webhook-endpoints"],
    queryFn: () => fetch("/api/webhooks").then((r) => r.json()),
  });

  const deleteEp = useMutation({
    mutationFn: (id: string) => fetch(`/api/webhooks/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: (res, id) => {
      if (res.success) {
        qc.setQueryData<{ endpoints: Endpoint[] }>(["webhook-endpoints"], (old) =>
          old ? { ...old, endpoints: old.endpoints.filter((e) => e.id !== id) } : old,
        );
        showToast("Endpoint removed.", "info");
      } else {
        showToast(res.error ?? "Failed to delete", "error");
      }
    },
  });

  const toggleEp = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      fetch(`/api/webhooks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      }).then((r) => r.json()),
    onSuccess: (res) => {
      if (res.success) {
        qc.invalidateQueries({ queryKey: ["webhook-endpoints"] });
      } else {
        showToast(res.error ?? "Failed to update", "error");
      }
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-800">Webhooks &amp; API</h2>
        <p className="mt-1 text-sm text-slate-500">
          Integrate with your CRM or automation tools. Use outgoing webhooks to receive real-time
          events, or the incoming API to send messages and manage contacts programmatically.
        </p>
      </div>

      <ApiKeySection />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Webhook className="h-4 w-4 text-slate-500" />
            <h3 className="font-semibold text-slate-800">Outgoing Webhooks</h3>
            {data?.endpoints?.length ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                {data.endpoints.length}
              </span>
            ) : null}
          </div>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>

        <p className="mb-4 text-sm text-slate-500">
          We send a signed POST request to your URL whenever selected events occur. Verify the
          signature with{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">X-Webhook-Signature: sha256=…</code>{" "}
          using HMAC-SHA256 with your endpoint&apos;s secret.
        </p>

        {showAdd && (
          <div className="mb-4">
            <AddEndpointForm
              onAdded={() => {
                qc.invalidateQueries({ queryKey: ["webhook-endpoints"] });
                setShowAdd(false);
              }}
            />
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : !data?.endpoints?.length ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center">
            <Webhook className="mx-auto mb-2 h-8 w-8 text-slate-300" />
            <p className="text-sm text-slate-400">No webhook endpoints yet. Add one to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.endpoints.map((ep) => (
              <EndpointRow
                key={ep.id}
                ep={ep}
                onDelete={(id) => deleteEp.mutate(id)}
                onToggle={(id, active) => toggleEp.mutate({ id, isActive: active })}
              />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 p-5">
        <h3 className="mb-2 font-semibold text-slate-800">Incoming API Reference</h3>
        <div className="space-y-3 text-sm">
          <div>
            <p className="font-medium text-slate-700">Send a message</p>
            <code className="mt-1 block rounded bg-slate-50 p-2 text-xs text-slate-600">
              POST /api/v1/messages<br />
              Authorization: Bearer &lt;api_key&gt;<br />
              {"{"} "to": "+919876543210", "type": "text", "text": "Hello!" {"}"}
            </code>
          </div>
          <div>
            <p className="font-medium text-slate-700">Create / list contacts</p>
            <code className="mt-1 block rounded bg-slate-50 p-2 text-xs text-slate-600">
              GET  /api/v1/contacts?search=rahul&amp;page=1<br />
              POST /api/v1/contacts<br />
              Authorization: Bearer &lt;api_key&gt;<br />
              {"{"} "name": "Rahul", "phone": "+919876543210" {"}"}
            </code>
          </div>
        </div>
      </section>
    </div>
  );
}
