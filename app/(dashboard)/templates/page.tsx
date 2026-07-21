"use client";

import { useMemo, useState } from "react";
import {
  FileText,
  Plus,
  Pencil,
  Copy,
  Trash2,
  Send,
  RefreshCw,
  AlertCircle,
  RotateCw,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  SkeletonRows,
  inputClass,
} from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";
import {
  useTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  useDuplicateTemplate,
  useSubmitTemplate,
  useRefreshTemplate,
  useSyncTemplates,
  type TemplateDTO,
  type TemplateButton,
  type TemplateInput,
} from "@/hooks/useTemplates";

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600 ring-slate-500/20",
  SUBMITTED: "bg-sky-50 text-sky-700 ring-sky-600/20",
  PENDING: "bg-amber-50 text-amber-800 ring-amber-600/20",
  APPROVED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  REJECTED: "bg-rose-50 text-rose-700 ring-rose-600/20",
  DISABLED: "bg-slate-100 text-slate-500 ring-slate-400/20",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  DISABLED: "Disabled",
};

const TABS = ["ALL", "DRAFT", "SUBMITTED", "PENDING", "APPROVED", "REJECTED", "DISABLED"] as const;
type Tab = (typeof TABS)[number];

const CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"] as const;
const LANGUAGES = [
  { code: "en_US", label: "English (US)" },
  { code: "en_GB", label: "English (UK)" },
  { code: "hi_IN", label: "Hindi" },
  { code: "es_ES", label: "Spanish" },
  { code: "pt_BR", label: "Portuguese (BR)" },
  { code: "fr_FR", label: "French" },
  { code: "de_DE", label: "German" },
  { code: "ar_AR", label: "Arabic" },
  { code: "id_ID", label: "Indonesian" },
];

const EDITABLE = new Set(["DRAFT", "REJECTED"]);
const DELETABLE = new Set(["DRAFT", "REJECTED", "DISABLED"]);

export default function TemplatesPage() {
  const [tab, setTab] = useState<Tab>("ALL");
  const { data, isLoading, isError } = useTemplates();
  const [modal, setModal] = useState<{ open: boolean; editing: TemplateDTO | null }>({ open: false, editing: null });
  const [rejection, setRejection] = useState<TemplateDTO | null>(null);

  const del = useDeleteTemplate();
  const duplicate = useDuplicateTemplate();
  const submit = useSubmitTemplate();
  const refresh = useRefreshTemplate();
  const syncAll = useSyncTemplates();

  const all: TemplateDTO[] = useMemo(() => data ?? [], [data]);
  const templates = useMemo(
    () => (tab === "ALL" ? all : all.filter((t) => t.status === tab)),
    [all, tab],
  );

  const run = (p: Promise<unknown>) => p.catch((e: Error) => alert(e.message));

  return (
    <div>
      <PageHeader
        title="Message Templates"
        description="Create WhatsApp templates, submit them to Meta for approval, and use approved ones in campaigns."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => run(syncAll.mutateAsync())} disabled={syncAll.isPending}>
              <RefreshCw className={cn("h-4 w-4", syncAll.isPending && "animate-spin")} />
              Sync all
            </Button>
            <Button onClick={() => setModal({ open: true, editing: null })}>
              <Plus className="h-4 w-4" />
              Create Template
            </Button>
          </div>
        }
      />

      <div className="scrollbar-slim mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition",
              tab === t
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {t === "ALL" ? "All" : STATUS_LABEL[t]}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-4">
            <SkeletonRows rows={6} />
          </div>
        ) : isError || templates.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={isError ? "Templates aren't available yet" : "No templates yet"}
            description={
              isError
                ? "Couldn't load templates. Check that WhatsApp is connected in Settings."
                : "Create your first template and submit it to Meta for approval."
            }
            action={
              <Button onClick={() => setModal({ open: true, editing: null })}>
                <Plus className="h-4 w-4" />
                Create Template
              </Button>
            }
          />
        ) : (
          <div className="scrollbar-slim overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Language</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Last Synced</th>
                  <th className="px-4 py-3 font-medium">Meta ID</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {templates.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-mono text-[13px] font-medium text-slate-900">{t.name}</p>
                      <p className="mt-0.5 max-w-sm truncate text-xs text-slate-500">{t.body}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{t.category}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{t.language}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Badge className={STATUS_STYLE[t.status] ?? STATUS_STYLE.DRAFT}>
                          {STATUS_LABEL[t.status] ?? t.status}
                        </Badge>
                        {t.status === "REJECTED" && (
                          <button
                            onClick={() => setRejection(t)}
                            className="text-rose-500 hover:text-rose-700"
                            aria-label="View rejection reason"
                            title="View rejection reason"
                          >
                            <AlertCircle className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">
                      {t.lastSyncedAt ? formatDate(t.lastSyncedAt) : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">
                      {t.waTemplateId ? t.waTemplateId.slice(0, 12) + "…" : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {EDITABLE.has(t.status) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Submit to Meta"
                            aria-label="Submit to Meta"
                            disabled={submit.isPending}
                            onClick={() => run(submit.mutateAsync(t.id))}
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        )}
                        {(t.status === "SUBMITTED" || t.status === "PENDING" || (t.waTemplateId && t.status !== "DRAFT")) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Refresh status"
                            aria-label="Refresh status"
                            disabled={refresh.isPending}
                            onClick={() => run(refresh.mutateAsync(t.id))}
                          >
                            <RotateCw className="h-4 w-4" />
                          </Button>
                        )}
                        {EDITABLE.has(t.status) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Edit"
                            aria-label="Edit template"
                            onClick={() => setModal({ open: true, editing: t })}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Duplicate"
                          aria-label="Duplicate template"
                          disabled={duplicate.isPending}
                          onClick={() => run(duplicate.mutateAsync(t.id))}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title={DELETABLE.has(t.status) ? "Delete" : "Approved/in-review templates can't be deleted"}
                          aria-label="Delete template"
                          className="text-rose-600 hover:bg-rose-50"
                          disabled={!DELETABLE.has(t.status) || del.isPending}
                          onClick={() => {
                            if (confirm(`Delete template "${t.name}"?`)) run(del.mutateAsync(t.id));
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <TemplateModal
        key={modal.editing?.id ?? "new"}
        open={modal.open}
        editing={modal.editing}
        onClose={() => setModal({ open: false, editing: null })}
      />

      <Modal
        open={Boolean(rejection)}
        onClose={() => setRejection(null)}
        title="Rejection reason"
        description={rejection ? `Meta rejected "${rejection.name}".` : ""}
      >
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {rejection?.rejectionReason || "No reason was provided by Meta."}
        </p>
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={() => setRejection(null)}>
            Close
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function TemplateModal({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: TemplateDTO | null;
  onClose: () => void;
}) {
  const create = useCreateTemplate();
  const update = useUpdateTemplate();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(editing?.name ?? "");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>(
    (editing?.category as (typeof CATEGORIES)[number]) ?? "MARKETING",
  );
  const [language, setLanguage] = useState(editing?.language ?? "en_US");
  const [headerContent, setHeaderContent] = useState(editing?.headerContent ?? "");
  const [body, setBody] = useState(editing?.body ?? "");
  const [footer, setFooter] = useState(editing?.footer ?? "");
  const [variables, setVariables] = useState((editing?.variables ?? []).join(", "));
  const [buttons, setButtons] = useState<TemplateButton[]>(editing?.buttons ?? []);

  const pending = create.isPending || update.isPending;

  const submit = () => {
    setError(null);
    const varList = variables.split(",").map((v) => v.trim()).filter(Boolean);
    const payload: TemplateInput = {
      name: name.trim(),
      category,
      language,
      body,
      headerType: headerContent.trim() ? "TEXT" : null,
      headerContent: headerContent.trim() || null,
      footer: footer.trim() || null,
      buttons: buttons.length > 0 ? buttons : null,
      variables: varList,
    };
    const req = editing
      ? update.mutateAsync({ id: editing.id, data: payload })
      : create.mutateAsync(payload);
    req.then(onClose).catch((e: Error) => setError(e.message));
  };

  const addButton = () =>
    setButtons((b) => [...b, { type: "QUICK_REPLY", text: "" } as TemplateButton].slice(0, 10));
  const updateButton = (i: number, patch: Partial<TemplateButton>) =>
    setButtons((b) => b.map((btn, idx) => (idx === i ? { ...btn, ...patch } : btn)));
  const removeButton = (i: number) => setButtons((b) => b.filter((_, idx) => idx !== i));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit Template" : "Create Template"}
      description="Draft a WhatsApp template. Submit it to Meta once you're happy — approval can take a few minutes to hours."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Template name" htmlFor="tpl-name" required>
          <input
            id="tpl-name"
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
            className={cn(inputClass, "font-mono")}
            placeholder="order_confirmation"
          />
          <p className="mt-1 text-xs text-slate-500">Lowercase letters, numbers and underscores only.</p>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category" htmlFor="tpl-category" required>
            <select
              id="tpl-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
              className={inputClass}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Language" htmlFor="tpl-language" required>
            <select
              id="tpl-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className={inputClass}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label} ({l.code})</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Header (optional)" htmlFor="tpl-header">
          <input
            id="tpl-header"
            value={headerContent}
            onChange={(e) => setHeaderContent(e.target.value)}
            className={inputClass}
            placeholder="Your order is confirmed"
          />
        </Field>

        <Field label="Body" htmlFor="tpl-body" required>
          <textarea
            id="tpl-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className={cn(inputClass, "resize-y")}
            placeholder={"Hi {{1}}, your order {{2}} has shipped."}
          />
          <p className="mt-1 text-xs text-slate-500">
            Use numbered variables {"{{1}}"}, {"{{2}}"} in order. Provide an example for each below.
          </p>
        </Field>

        <Field label="Variable examples (comma-separated)" htmlFor="tpl-vars">
          <input
            id="tpl-vars"
            value={variables}
            onChange={(e) => setVariables(e.target.value)}
            className={inputClass}
            placeholder="Aman, #12345"
          />
        </Field>

        <Field label="Footer (optional)" htmlFor="tpl-footer">
          <input
            id="tpl-footer"
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
            maxLength={60}
            className={inputClass}
            placeholder="Reply STOP to unsubscribe"
          />
        </Field>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Buttons (optional)</span>
            {buttons.length < 10 && (
              <button type="button" onClick={addButton} className="text-xs font-medium text-emerald-700 hover:underline">
                + Add button
              </button>
            )}
          </div>
          <div className="space-y-2">
            {buttons.map((b, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2">
                <select
                  value={b.type}
                  onChange={(e) => updateButton(i, { type: e.target.value as TemplateButton["type"] })}
                  className={cn(inputClass, "w-36")}
                >
                  <option value="QUICK_REPLY">Quick reply</option>
                  <option value="URL">URL</option>
                  <option value="PHONE_NUMBER">Phone</option>
                </select>
                <input
                  value={b.text}
                  onChange={(e) => updateButton(i, { text: e.target.value })}
                  className={cn(inputClass, "flex-1 min-w-32")}
                  placeholder="Button text"
                />
                {b.type === "URL" && (
                  <input
                    value={b.url ?? ""}
                    onChange={(e) => updateButton(i, { url: e.target.value })}
                    className={cn(inputClass, "flex-1 min-w-32")}
                    placeholder="https://…"
                  />
                )}
                {b.type === "PHONE_NUMBER" && (
                  <input
                    value={b.phone ?? ""}
                    onChange={(e) => updateButton(i, { phone: e.target.value })}
                    className={cn(inputClass, "flex-1 min-w-32")}
                    placeholder="+15551234567"
                  />
                )}
                <button type="button" onClick={() => removeButton(i)} className="text-rose-500 hover:text-rose-700" aria-label="Remove button">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || !body.trim() || pending}>
            {pending ? "Saving…" : editing ? "Save changes" : "Create draft"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
