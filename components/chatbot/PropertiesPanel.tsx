"use client";

import { Copy, Trash2, X } from "lucide-react";
import { Button, Field, inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { NODE_META } from "@/lib/chatbot/types";
import type {
  AnyNodeData,
  ApiHeader,
  ApiNodeData,
  AiNodeData,
  ConditionNodeData,
  ConditionRoute,
  DelayNodeData,
  FlowNode,
  HandoffNodeData,
  MessageNodeData,
  NodeKind,
  QuestionNodeData,
} from "@/lib/chatbot/types";
import { NODE_ICON } from "./nodeMeta";

const labelCls = "mb-1.5 block text-sm font-medium text-slate-700";

export function PropertiesPanel({
  node,
  onChange,
  onDelete,
  onDuplicate,
  onClose,
}: {
  node: FlowNode | null;
  onChange: (id: string, data: AnyNodeData) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onClose: () => void;
}) {
  if (!node) {
    return (
      <aside className="flex w-72 shrink-0 items-center justify-center border-l border-slate-200 bg-white p-6 text-center">
        <p className="text-sm text-slate-400">Select a node to edit its properties.</p>
      </aside>
    );
  }

  const meta = NODE_META[node.type as NodeKind];
  const Icon = NODE_ICON[node.type as NodeKind];
  const data = node.data as AnyNodeData;
  const set = (patch: Partial<AnyNodeData>) => onChange(node.id, { ...data, ...patch } as AnyNodeData);

  return (
    <aside className="scrollbar-slim flex w-72 shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn("flex h-6 w-6 items-center justify-center rounded-md", meta.chip)}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="truncate text-sm font-semibold text-slate-800">{meta.label}</span>
        </span>
        <button onClick={onClose} aria-label="Close properties" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 p-4">
        <Field label="Label" htmlFor="np-label">
          <input
            id="np-label"
            className={inputClass}
            value={(data as { label?: string }).label ?? ""}
            onChange={(e) => set({ label: e.target.value } as Partial<AnyNodeData>)}
            placeholder={meta.label}
          />
        </Field>

        {node.type === "message" && <MessageFields data={data as MessageNodeData} set={set} />}
        {node.type === "question" && <QuestionFields data={data as QuestionNodeData} set={set} />}
        {node.type === "condition" && <ConditionFields data={data as ConditionNodeData} set={set} />}
        {node.type === "api" && <ApiFields data={data as ApiNodeData} set={set} />}
        {node.type === "delay" && <DelayFields data={data as DelayNodeData} set={set} />}
        {node.type === "handoff" && <HandoffFields data={data as HandoffNodeData} set={set} />}
        {node.type === "ai" && <AiFields data={data as AiNodeData} set={set} />}
        {(node.type === "start" || node.type === "end") && (
          <p className="text-xs text-slate-400">This node has no extra configuration.</p>
        )}
      </div>

      <div className="sticky bottom-0 flex gap-2 border-t border-slate-200 bg-white p-3">
        {node.type !== "start" && (
          <Button variant="secondary" size="sm" className="flex-1" onClick={() => onDuplicate(node.id)}>
            <Copy className="h-3.5 w-3.5" />
            Duplicate
          </Button>
        )}
        {node.type !== "start" && (
          <Button variant="danger" size="sm" className="flex-1" onClick={() => onDelete(node.id)}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        )}
      </div>
    </aside>
  );
}

type Setter = (patch: Partial<AnyNodeData>) => void;

function MessageFields({ data, set }: { data: MessageNodeData; set: Setter }) {
  return (
    <>
      <Field label="Message text" htmlFor="np-text">
        <textarea
          id="np-text"
          rows={4}
          className={cn(inputClass, "resize-y")}
          value={data.text ?? ""}
          onChange={(e) => set({ text: e.target.value })}
          placeholder="Hi {{name}}! How can we help?"
        />
        <p className="mt-1 text-[11px] text-slate-400">Use {"{{variable}}"} to insert stored answers.</p>
      </Field>
      <Field label="Media URL (optional)" htmlFor="np-media">
        <input id="np-media" className={inputClass} value={data.mediaUrl ?? ""} onChange={(e) => set({ mediaUrl: e.target.value })} placeholder="https://…" />
      </Field>
      <div>
        <span className={labelCls}>Media type</span>
        <select className={inputClass} value={data.mediaType ?? "image"} onChange={(e) => set({ mediaType: e.target.value as MessageNodeData["mediaType"] })}>
          {["image", "video", "document", "audio"].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <Field label="Typing delay (seconds)" htmlFor="np-typing">
        <input id="np-typing" type="number" min={0} className={inputClass} value={data.typingDelay ?? 0} onChange={(e) => set({ typingDelay: Number(e.target.value) })} />
      </Field>
    </>
  );
}

function QuestionFields({ data, set }: { data: QuestionNodeData; set: Setter }) {
  return (
    <>
      <Field label="Question" htmlFor="np-question">
        <textarea id="np-question" rows={3} className={cn(inputClass, "resize-y")} value={data.question ?? ""} onChange={(e) => set({ question: e.target.value })} placeholder="What's your budget?" />
      </Field>
      <Field label="Store answer as" htmlFor="np-var">
        <input id="np-var" className={inputClass} value={data.variable ?? ""} onChange={(e) => set({ variable: e.target.value.replace(/[^\w]/g, "") })} placeholder="budget" />
      </Field>
      <div>
        <span className={labelCls}>Validation</span>
        <select className={inputClass} value={data.validation ?? "none"} onChange={(e) => set({ validation: e.target.value as QuestionNodeData["validation"] })}>
          {["none", "text", "number", "email", "phone"].map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>
    </>
  );
}

function ConditionFields({ data, set }: { data: ConditionNodeData; set: Setter }) {
  const routes = data.routes ?? [];
  const update = (i: number, patch: Partial<ConditionRoute>) =>
    set({ routes: routes.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  const add = () =>
    set({ routes: [...routes, { id: `r${Date.now().toString(36)}`, label: `Route ${routes.length + 1}`, operator: "eq", value: "" }] });
  const remove = (i: number) => set({ routes: routes.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-3">
      <span className={labelCls}>Routes (first match wins, else falls through)</span>
      {routes.map((r, i) => (
        <div key={r.id} className="space-y-2 rounded-lg border border-slate-200 p-2.5">
          <div className="flex items-center gap-2">
            <input className={cn(inputClass, "h-8 text-xs")} value={r.label ?? ""} onChange={(e) => update(i, { label: e.target.value })} placeholder="Label" />
            <button onClick={() => remove(i)} aria-label="Remove route" className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <input className={cn(inputClass, "h-8 text-xs")} value={r.variable ?? ""} onChange={(e) => update(i, { variable: e.target.value.replace(/[^\w]/g, "") })} placeholder="variable" />
          <div className="flex gap-2">
            <select className={cn(inputClass, "h-8 w-28 text-xs")} value={r.operator ?? "eq"} onChange={(e) => update(i, { operator: e.target.value as ConditionRoute["operator"] })}>
              <option value="eq">equals</option>
              <option value="neq">not equals</option>
              <option value="contains">contains</option>
              <option value="gt">greater than</option>
              <option value="lt">less than</option>
              <option value="exists">exists</option>
            </select>
            <input className={cn(inputClass, "h-8 text-xs")} value={r.value ?? ""} onChange={(e) => update(i, { value: e.target.value })} placeholder="value" disabled={r.operator === "exists"} />
          </div>
        </div>
      ))}
      <Button variant="secondary" size="sm" onClick={add}>Add route</Button>
    </div>
  );
}

function ApiFields({ data, set }: { data: ApiNodeData; set: Setter }) {
  const headers = data.headers ?? [];
  const updateH = (i: number, patch: Partial<ApiHeader>) => set({ headers: headers.map((h, idx) => (idx === i ? { ...h, ...patch } : h)) });
  const addH = () => set({ headers: [...headers, { key: "", value: "" }] });
  const removeH = (i: number) => set({ headers: headers.filter((_, idx) => idx !== i) });

  return (
    <>
      <div>
        <span className={labelCls}>Method</span>
        <select className={inputClass} value={data.method ?? "GET"} onChange={(e) => set({ method: e.target.value as ApiNodeData["method"] })}>
          {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
      <Field label="URL" htmlFor="np-url">
        <input id="np-url" className={inputClass} value={data.url ?? ""} onChange={(e) => set({ url: e.target.value })} placeholder="https://api.example.com/lookup" />
      </Field>
      <div>
        <span className={labelCls}>Headers</span>
        <div className="space-y-2">
          {headers.map((h, i) => (
            <div key={i} className="flex gap-2">
              <input className={cn(inputClass, "h-8 text-xs")} value={h.key} onChange={(e) => updateH(i, { key: e.target.value })} placeholder="Key" />
              <input className={cn(inputClass, "h-8 text-xs")} value={h.value} onChange={(e) => updateH(i, { value: e.target.value })} placeholder="Value" />
              <button onClick={() => removeH(i)} aria-label="Remove header" className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={addH}>Add header</Button>
        </div>
      </div>
      {data.method !== "GET" && (
        <Field label="Body (JSON)" htmlFor="np-body">
          <textarea id="np-body" rows={3} className={cn(inputClass, "resize-y font-mono text-xs")} value={data.body ?? ""} onChange={(e) => set({ body: e.target.value })} placeholder='{"key":"{{variable}}"}' />
        </Field>
      )}
      <Field label="Save response as" htmlFor="np-saveas">
        <input id="np-saveas" className={inputClass} value={data.saveAs ?? ""} onChange={(e) => set({ saveAs: e.target.value.replace(/[^\w]/g, "") })} placeholder="apiResult" />
      </Field>
      <Field label="Timeout (seconds)" htmlFor="np-timeout">
        <input id="np-timeout" type="number" min={1} className={inputClass} value={data.timeout ?? 15} onChange={(e) => set({ timeout: Number(e.target.value) })} />
      </Field>
    </>
  );
}

function DelayFields({ data, set }: { data: DelayNodeData; set: Setter }) {
  return (
    <Field label="Delay (seconds)" htmlFor="np-seconds">
      <input id="np-seconds" type="number" min={0} className={inputClass} value={data.seconds ?? 0} onChange={(e) => set({ seconds: Number(e.target.value) })} />
    </Field>
  );
}

function HandoffFields({ data, set }: { data: HandoffNodeData; set: Setter }) {
  return (
    <>
      <Field label="Team" htmlFor="np-team">
        <input id="np-team" className={inputClass} value={data.team ?? data.department ?? ""} onChange={(e) => set({ team: e.target.value })} placeholder="Sales" />
      </Field>
      <Field label="Queue" htmlFor="np-queue">
        <input id="np-queue" className={inputClass} value={data.queue ?? ""} onChange={(e) => set({ queue: e.target.value })} placeholder="Priority leads" />
      </Field>
      <Field label="Handoff note" htmlFor="np-note">
        <textarea id="np-note" rows={3} className={cn(inputClass, "resize-y")} value={data.note ?? ""} onChange={(e) => set({ note: e.target.value })} placeholder="Context for the agent…" />
      </Field>
    </>
  );
}

function AiFields({ data, set }: { data: AiNodeData; set: Setter }) {
  return (
    <>
      <Field label="AI instruction" htmlFor="np-prompt">
        <textarea id="np-prompt" rows={4} className={cn(inputClass, "resize-y")} value={data.prompt ?? ""} onChange={(e) => set({ prompt: e.target.value })} placeholder="Answer the customer's question using the knowledge base." />
      </Field>
      <Field label="Model" htmlFor="np-ai-model">
        <input id="np-ai-model" className={inputClass} value={data.model ?? ""} onChange={(e) => set({ model: e.target.value })} placeholder="Default tenant model" />
      </Field>
      <Field label="Temperature" htmlFor="np-ai-temp">
        <input id="np-ai-temp" type="number" min={0} max={2} step={0.1} className={inputClass} value={data.temperature ?? 0.7} onChange={(e) => set({ temperature: Number(e.target.value) })} />
      </Field>
      <Field label="Save reply as" htmlFor="np-ai-saveas">
        <input id="np-ai-saveas" className={inputClass} value={data.saveAs ?? ""} onChange={(e) => set({ saveAs: e.target.value.replace(/[^\w]/g, "") })} placeholder="aiReply" />
      </Field>
    </>
  );
}
