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
  Download,
  AlertCircle,
  RotateCw,
  Loader2,
  Info,
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
import { useToast } from "@/components/ui/toast";
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
  useImportTemplates,
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

const CATEGORY_TABS = ["ALL", "MARKETING", "UTILITY", "AUTHENTICATION"] as const;
type CategoryTab = (typeof CATEGORY_TABS)[number];

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
  const [categoryTab, setCategoryTab] = useState<CategoryTab>("ALL");
  const { data, isLoading, isError } = useTemplates();
  const [modal, setModal] = useState<{ open: boolean; editing: TemplateDTO | null }>({ open: false, editing: null });
  const [rejection, setRejection] = useState<TemplateDTO | null>(null);
  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState<TemplateDTO | null>(null);
  const { showToast } = useToast();

  const del = useDeleteTemplate();
  const duplicate = useDuplicateTemplate();
  const submit = useSubmitTemplate();
  const refresh = useRefreshTemplate();
  const syncAll = useSyncTemplates();
  const importFromMeta = useImportTemplates();

  const all: TemplateDTO[] = useMemo(() => data ?? [], [data]);
  const templates = useMemo(
    () => {
      let list = tab === "ALL" ? all : all.filter((t) => t.status === tab);
      if (categoryTab !== "ALL") list = list.filter((t) => t.category === categoryTab);
      return list;
    },
    [all, tab, categoryTab],
  );

  const handleSyncAll = async () => {
    try {
      await syncAll.mutateAsync();
      showToast("Template statuses synced.", "success");
    }
    catch (e) { showToast((e as Error).message, "error"); }
  };

  const handleImport = async () => {
    try {
      const result = await importFromMeta.mutateAsync();
      if (result.created === 0 && result.updated === 0) {
        showToast("No new templates found on Meta.", "info");
      } else {
        showToast(`Imported ${result.created} new, updated ${result.updated} template(s).`, "success");
      }
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  const handleAction = async (p: Promise<unknown>, successMsg?: string) => {
    try {
      await p;
      if (successMsg) showToast(successMsg, "success");
    }
    catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!confirmDeleteTemplate) return;
    try {
      await del.mutateAsync(confirmDeleteTemplate.id);
      setConfirmDeleteTemplate(null);
      showToast("Template deleted.", "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  // Shared by the desktop table and the phone card list.
  const renderStatus = (t: TemplateDTO) => (
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
  );
  const renderActions = (t: TemplateDTO) => (
    <>
      {EDITABLE.has(t.status) && (
        <Button
          variant="ghost"
          size="sm"
          title="Submit to Meta"
          aria-label="Submit to Meta"
          disabled={submit.isPending && submit.variables === t.id}
          onClick={() => handleAction(submit.mutateAsync(t.id), "Submitted to Meta for review.")}
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
          disabled={refresh.isPending && refresh.variables === t.id}
          onClick={() => handleAction(refresh.mutateAsync(t.id), "Status refreshed.")}
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
        disabled={duplicate.isPending && duplicate.variables === t.id}
        onClick={() => handleAction(duplicate.mutateAsync(t.id), "Template duplicated.")}
      >
        <Copy className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        title={DELETABLE.has(t.status) ? "Delete" : "Approved/in-review templates can't be deleted"}
        aria-label="Delete template"
        className="text-rose-600 hover:bg-rose-50"
        disabled={!DELETABLE.has(t.status) || (del.isPending && confirmDeleteTemplate?.id === t.id)}
        onClick={() => setConfirmDeleteTemplate(t)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </>
  );

  return (
    <div>
      <PageHeader
        title="Message Templates"
        description="Create WhatsApp templates, submit them to Meta for approval, and use approved ones in campaigns."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={handleImport}
              disabled={importFromMeta.isPending || syncAll.isPending}
              title="Pull all templates from Meta WABA into this app"
            >
              <Download className={cn("h-4 w-4", importFromMeta.isPending && "animate-bounce")} />
              Import from Meta
            </Button>
            <Button variant="secondary" onClick={handleSyncAll} disabled={syncAll.isPending || importFromMeta.isPending}>
              <RefreshCw className={cn("h-4 w-4", syncAll.isPending && "animate-spin")} />
              Sync status
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

      <div className="scrollbar-slim mb-4 flex gap-2 overflow-x-auto">
        {CATEGORY_TABS.map((c) => (
          <button
            key={c}
            onClick={() => setCategoryTab(c)}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition",
              categoryTab === c
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {c === "ALL" ? "All categories" : c.charAt(0) + c.slice(1).toLowerCase()}
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
          <>
          {/* Phones: stacked cards instead of the 7-column table */}
          <ul className="divide-y divide-slate-100 md:hidden">
            {templates.map((t) => (
              <li key={t.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-all font-mono text-[13px] font-medium text-slate-900">{t.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {t.category} · <span className="font-mono">{t.language}</span>
                      {t.lastSyncedAt && <> · synced {formatDate(t.lastSyncedAt)}</>}
                    </p>
                  </div>
                  <div className="shrink-0">{renderStatus(t)}</div>
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-slate-500">{t.body}</p>
                <div className="mt-2 flex items-center justify-end gap-1 [&>button]:h-10 [&>button]:w-10">
                  {renderActions(t)}
                </div>
              </li>
            ))}
          </ul>
          <div className="scrollbar-slim hidden overflow-x-auto md:block">
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
                      {renderStatus(t)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">
                      {t.lastSyncedAt ? formatDate(t.lastSyncedAt) : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">
                      {t.waTemplateId ? t.waTemplateId.slice(0, 12) + "…" : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">{renderActions(t)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>

      <TemplateModal
        key={modal.editing?.id ?? "new"}
        open={modal.open}
        editing={modal.editing}
        onClose={() => setModal({ open: false, editing: null })}
        showToast={showToast}
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
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>button]:h-10 [&>button]:w-full sm:[&>button]:h-9 sm:[&>button]:w-auto">
          <Button variant="secondary" onClick={() => setRejection(null)}>
            Close
          </Button>
        </div>
      </Modal>

      <Modal
        open={!!confirmDeleteTemplate}
        onClose={() => { if (!del.isPending) setConfirmDeleteTemplate(null); }}
        title="Delete template?"
        description={confirmDeleteTemplate ? `"${confirmDeleteTemplate.name}" will be permanently removed and cannot be recovered.` : ""}
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>button]:h-10 [&>button]:w-full sm:[&>button]:h-9 sm:[&>button]:w-auto">
          <Button variant="secondary" onClick={() => setConfirmDeleteTemplate(null)} disabled={del.isPending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDeleteConfirmed} disabled={del.isPending}>
            {del.isPending ? "Deleting…" : "Delete template"}
          </Button>
        </div>
      </Modal>

    </div>
  );
}

const HEADER_TYPES = [
  { value: "NONE", label: "None" },
  { value: "TEXT", label: "Text" },
  { value: "IMAGE", label: "Image" },
  { value: "VIDEO", label: "Video" },
  { value: "DOCUMENT", label: "Document" },
] as const;
type HeaderTypeOption = "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";

const HEADER_MEDIA_PLACEHOLDER: Record<string, string> = {
  IMAGE: "https://example.com/sample-image.jpg",
  VIDEO: "https://example.com/sample-video.mp4",
  DOCUMENT: "https://example.com/sample.pdf",
};

function hasPlaceholder(text: string) {
  return /\{\{\s*\d+\s*\}\}/.test(text);
}

// ─── Button compatibility rules (Meta official) ───────────────────────────────
// AUTH  → 1 OTP only. No other types.
// MARKETING / UTILITY → Quick Reply (max 10) OR CTA buttons — never mixed.
//   CTA limits: URL ×2, PHONE_NUMBER ×1, VOICE_CALL ×1, COPY_CODE ×1.
// Max 10 buttons total across all categories.

const BUTTON_TYPE_META = [
  { value: "QUICK_REPLY",  label: "Quick reply",         group: "qr"  },
  { value: "URL",          label: "Visit website",        group: "cta" },
  { value: "PHONE_NUMBER", label: "Call phone number",    group: "cta" },
  { value: "VOICE_CALL",   label: "Call on WhatsApp",     group: "cta" },
  { value: "COPY_CODE",    label: "Copy offer code",      group: "cta" },
  { value: "OTP",          label: "Copy Code (OTP)",      group: "otp" },
] as const;

const BUTTON_MAX: Record<string, number> = {
  QUICK_REPLY: 10,
  URL: 2,
  PHONE_NUMBER: 1,
  VOICE_CALL: 1,
  COPY_CODE: 1,
  OTP: 1,
};

function getAvailableButtonTypes(
  category: string,
  existing: TemplateButton[],
  excludeIndex?: number,
) {
  const others = excludeIndex !== undefined
    ? existing.filter((_, i) => i !== excludeIndex)
    : existing;

  if (category === "AUTHENTICATION") {
    return BUTTON_TYPE_META.filter(
      (t) => t.value === "OTP" && !others.some((b) => b.type === "OTP"),
    );
  }

  const hasQR  = others.some((b) => b.type === "QUICK_REPLY");
  const hasCTA = others.some((b) =>
    ["URL", "PHONE_NUMBER", "VOICE_CALL", "COPY_CODE"].includes(b.type),
  );

  return BUTTON_TYPE_META.filter((t) => {
    if (t.value === "OTP") return false;           // OTP → AUTH only
    if (t.group === "qr"  && hasCTA) return false; // can't mix
    if (t.group === "cta" && hasQR)  return false; // can't mix
    return others.filter((b) => b.type === t.value).length < (BUTTON_MAX[t.value] ?? 1);
  });
}

function TemplateModal({
  open,
  editing,
  onClose,
  showToast,
}: {
  open: boolean;
  editing: TemplateDTO | null;
  onClose: () => void;
  showToast: (msg: string, kind: "success" | "error" | "info") => void;
}) {
  const create = useCreateTemplate();
  const update = useUpdateTemplate();

  const [name, setName] = useState(editing?.name ?? "");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>(
    (editing?.category as (typeof CATEGORIES)[number]) ?? "MARKETING",
  );
  const [language, setLanguage] = useState(editing?.language ?? "en_US");
  const [headerType, setHeaderType] = useState<HeaderTypeOption>(
    (editing?.headerType as HeaderTypeOption) ?? "NONE",
  );
  // For media headers: only restore if it's a valid Resumable Upload handle (4::…).
  // Old numeric IDs from the previous upload endpoint are invalid — clear them so
  // the user must re-upload rather than accidentally re-submitting bad data.
  const initialHeaderContent = (() => {
    const c = editing?.headerContent ?? "";
    const isMediaHeader = editing?.headerType && editing.headerType !== "TEXT";
    if (isMediaHeader && c && !c.startsWith("4::")) return "";
    return c;
  })();
  const [headerContent, setHeaderContent] = useState(initialHeaderContent);
  const [headerVarExample, setHeaderVarExample] = useState(
    (editing?.headerVariables ?? [])[0] ?? "",
  );
  const [body, setBody] = useState(editing?.body ?? "");
  const [footer, setFooter] = useState(editing?.footer ?? "");
  const [varExamples, setVarExamples] = useState<string[]>(editing?.variables ?? []);
  const [buttons, setButtons] = useState<TemplateButton[]>(editing?.buttons ?? []);

  // User-selected variable format. Seeded from the editing template's body on open.
  const [paramFormat] = useState<"POSITIONAL" | "NAMED">(() => {
    const b = editing?.body ?? "";
    return /\{\{[a-z_][a-z0-9_]*\}\}/.test(b) && !/\{\{\d+\}\}/.test(b) ? "NAMED" : "POSITIONAL";
  });

  const isNamedParams = paramFormat === "NAMED";

  // Extract named param identifiers from the body in order of appearance (deduped).
  const namedParamNames: string[] = (() => {
    if (!isNamedParams) return [];
    const names: string[] = [];
    const seen = new Set<string>();
    const re = /\{\{([a-z_][a-z0-9_]*)\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      if (!seen.has(m[1])) { seen.add(m[1]); names.push(m[1]); }
    }
    return names;
  })();

  // Count variable slots. Keep varExamples in sync when count grows.
  const bodyVarCount = isNamedParams
    ? namedParamNames.length
    : (() => {
        const indices = [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => parseInt(m[1]));
        return indices.length ? Math.max(...indices) : 0;
      })();
  if (varExamples.length < bodyVarCount) {
    setVarExamples((prev) => [...prev, ...Array(bodyVarCount - prev.length).fill("")]);
  }

  const pending = create.isPending || update.isPending;
  const headerHasVar = headerType === "TEXT" && hasPlaceholder(headerContent);

  // ── Draft-time validation ─────────────────────────────────────────────────
  // Covers every known Meta rejection cause so errors surface before submission.
  const bodyError: string | null = (() => {
    if (!body.trim()) return null;
    if (body.length > 1024)
      return `Body is ${body.length} chars — Meta's limit is 1,024.`;
    if (/\*\*[^*\n]+\*\*/.test(body))
      return "Use single *asterisks* for bold, not **double** — WhatsApp rejects double-asterisk formatting (error 131009).";
    if (/(?<![_])__[^_\n]+__/.test(body))
      return "Use single _underscores_ for italic, not __double__.";
    if (/\s$/.test(body))
      return "Remove the trailing space or newline at the end — Meta rejects bodies that end with whitespace (error 131009).";
    if (/^\s*\{\{/.test(body))
      return "Body cannot start with a variable — Meta requires at least one character before the first {{placeholder}} (error 2388299).";
    if (/\}\}\s*$/.test(body))
      return "Body cannot end with a variable — Meta requires at least one character after the last {{placeholder}} (error 2388299).";
    // Bold span *— text* (em dash after asterisk) - Meta validator expects a word char after *
    if (body[body.indexOf("*") + 1] === "\u2014" || body[body.indexOf("*") + 1] === "\u2013" ||
        ([...body].some((c, i) => (c === "*") && i + 1 < body.length && [0x2014, 0x2013, 0x2022].includes(body.charCodeAt(i + 1)))))
      return "A bold span starts with punctuation (e.g. *— text*). Move the punctuation outside the asterisks: — *text* instead of *— text* (error 131009).";
    // Hidden characters pasted from word processors - invisible but fatal to Meta
    if ([...body].some((c) => [0x00A0, 0x200B, 0x200C, 0x200D, 0x00AD, 0xFEFF, 0x2028, 0x2029].includes(c.charCodeAt(0))))
      return "Body contains hidden characters (non-breaking space, zero-width joiner, etc.) - likely pasted from Word. Clear and retype the body, or paste into Notepad first to strip them (error 131009).";
        // More than 2 consecutive blank lines
    if (/\n{4,}/.test(body))
      return "Body has more than 2 consecutive blank lines — Meta rejects excessive empty lines.";
    // Tabs
    if (/\t/.test(body))
      return "Body contains tab characters — replace them with spaces (Meta rejects tabs in template text).";
    // Non-sequential numbered variables e.g. {{1}}, {{3}} skipping {{2}}
    const indices = [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => parseInt(m[1]));
    const unique = [...new Set(indices)].sort((a, b) => a - b);
    if (unique.length > 0 && unique[0] !== 1)
      return `Variables must start at {{1}} — found {{${unique[0]}}} as the first variable.`;
    for (let i = 1; i < unique.length; i++) {
      if (unique[i] !== unique[i - 1] + 1)
        return `Variables must be sequential — {{${unique[i - 1]}}} jumps to {{${unique[i]}}}, missing {{${unique[i - 1] + 1}}}.`;
    }
    return null;
  })();

  const headerError: string | null = (() => {
    if (headerType !== "TEXT" || !headerContent.trim()) return null;
    if (headerContent.length > 60)
      return `Header is ${headerContent.length} chars — Meta's limit is 60.`;
    if (/[*_~`]/.test(headerContent))
      return "Markdown (*bold*, _italic_, etc.) is not allowed in headers — use plain text only (error 2388047).";
    return null;
  })();

  const varExampleErrors: (string | null)[] = varExamples.map((v) => {
    if (!v.trim()) return null;
    if (/^https?:\/\//i.test(v.trim()))
      return "URLs are not allowed as variable examples — use a short text value instead (error 2388299).";
    if (/[#$%]/.test(v))
      return "Variable examples cannot contain #, $, or % — Meta rejects these special characters.";
    return null;
  });

  const buttonErrors: (string | null)[] = buttons.map((b) => {
    if ((b.type === "PHONE_NUMBER" || b.type === "VOICE_CALL") && b.phone !== undefined) {
      if (b.phone && !/^\+\d{7,15}$/.test(b.phone.replace(/[\s\-()\s]/g, "")))
        return "Must start with + and country code, e.g. +919876543210.";
    }
    if (b.type === "URL" && b.url) {
      if (!/^https:\/\//i.test(b.url))
        return "URL must start with https://.";
    }
    if (b.type !== "OTP" && b.type !== "COPY_CODE" && !b.text.trim())
      return "Button text is required.";
    return null;
  });

  // Language-script mismatch: warn when a non-Latin language is selected but the
  // body contains no characters from that script.
  const languageError: string | null = (() => {
    if (!body.trim()) return null;
    const NON_LATIN: Record<string, { label: string; pattern: RegExp }> = {
      hi_IN: { label: "Hindi", pattern: /[ऀ-ॿ]/ },
      ar_AR: { label: "Arabic", pattern: /[؀-ۿݐ-ݿ]/ },
    };
    const info = NON_LATIN[language];
    if (!info) return null;
    if (!info.pattern.test(body))
      return `Language is set to ${info.label} but the body contains no ${info.label} characters — type in ${info.label} or change the language to English.`;
    return null;
  })();

  // Media header uploaded: block save when IMAGE/VIDEO/DOCUMENT is chosen in
  // upload mode but no file has been uploaded yet.
  const mediaHeaderError: string | null =
    (headerType === "IMAGE" || headerType === "VIDEO" || headerType === "DOCUMENT") &&
    !headerContent.trim()
      ? `Provide a ${headerType.toLowerCase()} for the header — upload a file or enter a URL.`
      : null;

  const hasDraftErrors =
    !!bodyError || !!headerError || !!languageError || !!mediaHeaderError ||
    varExampleErrors.some(Boolean) || buttonErrors.some(Boolean);

  // If the saved headerContent is a Resumable Upload handle (4::…), restore the
  // "upload done" state so the client sees their previous upload instead of a raw handle.
  const savedHandle = editing?.headerContent?.startsWith("4::") ? editing.headerContent : null;
  const [headerInputMode, setHeaderInputMode] = useState<"upload" | "url">(
    savedHandle || (editing?.headerType && editing.headerType !== "TEXT") ? "upload" : "url",
  );
  const [headerUploadState, setHeaderUploadState] = useState<"idle" | "uploading" | "done" | "error">(
    savedHandle ? "done" : "idle",
  );
  const [headerUploadFileName, setHeaderUploadFileName] = useState(
    savedHandle ? "Previously uploaded file" : "",
  );

  async function handleHeaderFileUpload(file: File) {
    const MAX_BYTES = 4 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      showToast(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is 4 MB.`, "error");
      return;
    }
    setHeaderUploadState("uploading");
    setHeaderUploadFileName(file.name);
    setHeaderContent("");
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/templates/upload-media", { method: "POST", body: form });
      const json = await res.json().catch(() => null) as { success: boolean; data?: { handle: string }; error?: string } | null;
      if (!res.ok || !json?.success) {
        const msg = json?.error ?? (res.status === 413 ? "File is too large for the server. Maximum is 4 MB." : "Upload failed — please try again.");
        throw new Error(msg);
      }
      setHeaderContent(json.data!.handle);
      setHeaderUploadState("done");
    } catch (err) {
      setHeaderUploadState("error");
      showToast(err instanceof Error ? err.message : "Upload failed — please try again.", "error");
    }
  }

  const submit = () => {
    if (!name.trim()) { showToast("Template name is required.", "error"); return; }
    if (!body.trim()) { showToast("Message body is required.", "error"); return; }
    const firstDraftError =
      bodyError ?? headerError ?? languageError ?? mediaHeaderError ??
      varExampleErrors.find(Boolean) ?? buttonErrors.find(Boolean) ?? null;
    if (firstDraftError) { showToast(firstDraftError, "error"); return; }
    const varList = varExamples.map((v) => v.trim()).filter(Boolean);
    const payload: TemplateInput = {
      name: name.trim(),
      category,
      language,
      body,
      // null explicitly clears the header when editing (undefined would leave old value in DB)
      headerType: headerType !== "NONE" ? (headerType as TemplateInput["headerType"]) : null,
      headerContent: headerType !== "NONE" && headerContent.trim() ? headerContent.trim() : null,
      headerVariables: headerHasVar && headerVarExample.trim() ? [headerVarExample.trim()] : [],
      footer: footer.trim() || undefined,
      buttons: buttons.length > 0 ? buttons : undefined,
      variables: varList,
    };
    const req = editing
      ? update.mutateAsync({ id: editing.id, ...payload })
      : create.mutateAsync(payload);
    req
      .then(() => {
        showToast(editing ? "Template saved." : "Draft created.", "success");
        onClose();
      })
      .catch((e: Error) => showToast(e.message, "error"));
  };

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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Category" htmlFor="tpl-category" required>
            <select
              id="tpl-category"
              value={category}
              onChange={(e) => {
                const next = e.target.value as (typeof CATEGORIES)[number];
                const wasAuth = category === "AUTHENTICATION";
                const willBeAuth = next === "AUTHENTICATION";
                if (wasAuth !== willBeAuth) setButtons([]); // incompatible button types
                setCategory(next);
              }}
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
              className={cn(inputClass, languageError && "border-amber-400 focus:ring-amber-400")}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label} ({l.code})</option>
              ))}
            </select>
            {languageError && (
              <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800 mt-1">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                {languageError}
              </p>
            )}
          </Field>
        </div>

        {/* Header */}
        <div className="space-y-2">
          <Field label="Header type (optional)" htmlFor="tpl-header-type">
            <select
              id="tpl-header-type"
              value={headerType}
              onChange={(e) => {
                setHeaderType(e.target.value as HeaderTypeOption);
                setHeaderContent("");
                setHeaderVarExample("");
                setHeaderUploadState("idle");
                setHeaderUploadFileName("");
              }}
              className={inputClass}
            >
              {HEADER_TYPES.map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
          </Field>

          {headerType === "TEXT" && (
            <div className="space-y-1.5">
              <input
                value={headerContent}
                onChange={(e) => setHeaderContent(e.target.value)}
                className={cn(inputClass, headerError && "border-rose-400 focus:ring-rose-400")}
                placeholder="Your order is confirmed  (use {{1}} for a variable)"
              />
              {headerError && (
                <p className="flex items-start gap-1.5 rounded-md bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  {headerError}
                </p>
              )}
              {headerHasVar && (
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-600">
                    Example value for <code className="rounded bg-slate-100 px-1">{"{{1}}"}</code> in header
                  </p>
                  <input
                    value={headerVarExample}
                    onChange={(e) => setHeaderVarExample(e.target.value)}
                    className={inputClass}
                    placeholder="e.g. Aman"
                  />
                </div>
              )}
            </div>
          )}

          {(headerType === "IMAGE" || headerType === "VIDEO" || headerType === "DOCUMENT") && (
            <div className="space-y-2">
              {/* Upload / URL toggle */}
              <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                {(["upload", "url"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setHeaderInputMode(mode);
                      setHeaderContent("");
                      setHeaderUploadState("idle");
                      setHeaderUploadFileName("");
                    }}
                    className={cn(
                      "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition",
                      headerInputMode === mode
                        ? "bg-white text-slate-800 shadow-sm"
                        : "text-slate-500 hover:text-slate-700",
                    )}
                  >
                    {mode === "upload" ? "📎 Upload sample file" : "🔗 Enter URL"}
                  </button>
                ))}
              </div>

              {headerInputMode === "upload" ? (
                <>
                  <label
                    className={cn(
                      "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center transition",
                      headerUploadState === "done"
                        ? "border-emerald-300 bg-emerald-50"
                        : headerUploadState === "error"
                          ? "border-rose-300 bg-rose-50"
                          : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100",
                    )}
                  >
                    {headerUploadState === "uploading" ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                        <span className="text-xs text-slate-500">Uploading to Meta…</span>
                      </>
                    ) : headerUploadState === "done" ? (
                      <>
                        <span className="text-xl">✅</span>
                        <span className="text-xs font-medium text-emerald-700">{headerUploadFileName}</span>
                        <span className="text-[11px] text-emerald-600">Uploaded — click to replace</span>
                      </>
                    ) : headerUploadState === "error" ? (
                      <>
                        <span className="text-xl">❌</span>
                        <span className="text-xs text-rose-600">Upload failed — click to retry</span>
                      </>
                    ) : (
                      <>
                        <span className="text-xl">
                          {headerType === "IMAGE" ? "🖼️" : headerType === "VIDEO" ? "🎬" : "📄"}
                        </span>
                        <span className="text-xs text-slate-600">
                          Click to select{" "}
                          {headerType === "IMAGE"
                            ? "an image (JPEG, PNG, WebP)"
                            : headerType === "VIDEO"
                              ? "a video (MP4)"
                              : "a document (PDF, Word, Excel)"}
                        </span>
                      </>
                    )}
                    <input
                      type="file"
                      className="sr-only"
                      accept={
                        headerType === "IMAGE"
                          ? "image/jpeg,image/png,image/webp"
                          : headerType === "VIDEO"
                            ? "video/mp4,video/3gpp"
                            : "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      }
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleHeaderFileUpload(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <p className="flex items-center gap-1 text-[11px] text-slate-400">
                    <Info className="h-3 w-3 shrink-0" />
                    This sample is uploaded to Meta and used during template review only.
                  </p>
                  {mediaHeaderError && headerUploadState !== "uploading" && (
                    <p className="flex items-start gap-1.5 rounded-md bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700">
                      <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                      {mediaHeaderError}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <input
                    value={headerContent}
                    onChange={(e) => setHeaderContent(e.target.value)}
                    className={inputClass}
                    placeholder={HEADER_MEDIA_PLACEHOLDER[headerType]}
                  />
                  <p className="flex items-center gap-1 text-[11px] text-slate-400">
                    <Info className="h-3 w-3 shrink-0" />
                    Sample URL shown to Meta during template review. Must be publicly accessible.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <Field label="Body" htmlFor="tpl-body" required>
          <textarea
            id="tpl-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className={cn(inputClass, "resize-y", bodyError && "border-rose-400 focus:ring-rose-400")}
            placeholder={isNamedParams
              ? "Hi {{first_name}}, your order {{order_id}} has shipped."
              : "Hi {{1}}, your order {{2}} has shipped."}
          />
          <div className="mt-1 flex items-start justify-between gap-2">
            <p className="text-xs text-slate-500">Use {"{{1}}"}, {"{{2}}"}… for personalisation.</p>
            <span className={cn("shrink-0 text-[11px] tabular-nums", body.length > 1024 ? "text-rose-600 font-medium" : "text-slate-400")}>
              {body.length}/1024
            </span>
          </div>
          {bodyError && (
            <p className="mt-1 flex items-start gap-1.5 rounded-md bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              {bodyError}
            </p>
          )}
        </Field>

        {bodyVarCount > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Variable examples</p>
            <div className="space-y-2">
              {Array.from({ length: bodyVarCount }, (_, i) => {
                const exVal = varExamples[i] ?? "";
                const isUrl = /^https?:\/\//i.test(exVal.trim());
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-20 shrink-0 truncate rounded bg-slate-100 px-2 py-1.5 text-center font-mono text-xs text-slate-600 sm:w-24">
                        {isNamedParams ? `{{${namedParamNames[i] ?? i + 1}}}` : `{{${i + 1}}}`}
                      </span>
                      <input
                        value={exVal}
                        onChange={(e) => {
                          const next = [...varExamples];
                          next[i] = e.target.value;
                          setVarExamples(next);
                        }}
                        className={cn(inputClass, varExampleErrors[i] ? "border-rose-400 focus:ring-rose-400" : isUrl && "border-amber-400 focus:ring-amber-400")}
                        placeholder={isNamedParams
                          ? `Example for {{${namedParamNames[i] ?? i + 1}}} — e.g. ${i === 0 ? "Aman" : i === 1 ? "ORDER123" : "sample"}`
                          : `Example for {{${i + 1}}} — e.g. ${i === 0 ? "Aman" : i === 1 ? "#12345" : "sample"}`}
                      />
                    </div>
                    {varExampleErrors[i] ? (
                      <p className="flex items-start gap-1.5 rounded-md bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700">
                        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                        {varExampleErrors[i]}
                      </p>
                    ) : isUrl ? (
                      <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" aria-hidden />
                        URLs are not allowed as variable examples — use a short text instead, e.g. <strong>TRACK123</strong> (error 2388299).
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">Shown to Meta reviewers only, not sent to customers.</p>
          </div>
        )}

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
          </div>

          {/* Category-specific rule hint */}
          {category === "AUTHENTICATION" ? (
            <p className="mb-2 flex items-start gap-1.5 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-700">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Authentication templates support only 1 Copy Code (OTP) button.
            </p>
          ) : buttons.some((b) => b.type === "QUICK_REPLY") && buttons.some((b) => ["URL","PHONE_NUMBER","VOICE_CALL","COPY_CODE"].includes(b.type)) ? (
            <p className="mb-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Quick reply buttons cannot be mixed with call-to-action buttons (URL, phone, etc.).
            </p>
          ) : null}

          <div className="space-y-2">
            {buttons.map((b, i) => {
              // Build the type options: always include the current type + types that are available
              const available = getAvailableButtonTypes(category, buttons, i);
              const currentMeta = BUTTON_TYPE_META.find((t) => t.value === b.type);
              const typeOptions = currentMeta && !available.find((t) => t.value === b.type)
                ? [currentMeta, ...available]
                : available;

              return (
                <div key={i} className="space-y-1.5 rounded-lg border border-slate-200 p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={b.type}
                      onChange={(e) => {
                        const t = e.target.value as TemplateButton["type"];
                        updateButton(i, {
                          type: t,
                          url: undefined, urlType: undefined, urlExample: undefined,
                          phone: undefined, offerCode: undefined,
                          otpType: t === "OTP" ? "COPY_CODE" : undefined,
                        });
                      }}
                      className={cn(inputClass, "w-full sm:w-44")}
                    >
                      {typeOptions.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    {b.type !== "COPY_CODE" && (
                      <input
                        value={b.text}
                        onChange={(e) => updateButton(i, { text: e.target.value })}
                        className={cn(inputClass, "flex-1 min-w-32")}
                        placeholder="Button text"
                        maxLength={25}
                      />
                    )}
                    <button type="button" onClick={() => removeButton(i)} className="p-2 text-rose-500 hover:text-rose-700 sm:p-0" aria-label="Remove button">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {b.type === "URL" && (
                    <div className="space-y-1.5 pl-1">
                      <div className="flex items-center gap-2">
                        <select
                          value={b.urlType ?? "STATIC"}
                          onChange={(e) => updateButton(i, { urlType: e.target.value as "STATIC" | "DYNAMIC", urlExample: undefined })}
                          className={cn(inputClass, "w-28 text-xs")}
                        >
                          <option value="STATIC">Static URL</option>
                          <option value="DYNAMIC">Dynamic URL</option>
                        </select>
                        <input
                          value={b.url ?? ""}
                          onChange={(e) => updateButton(i, { url: e.target.value })}
                          className={cn(inputClass, "flex-1", buttonErrors[i] && "border-rose-400 focus:ring-rose-400")}
                          placeholder={b.urlType === "DYNAMIC" ? "https://example.com/track/{{1}}" : "https://example.com"}
                        />
                      </div>
                      {buttonErrors[i] && (
                        <p className="flex items-center gap-1 text-[11px] text-rose-600">
                          <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />{buttonErrors[i]}
                        </p>
                      )}
                      {b.urlType === "DYNAMIC" && (
                        <input
                          value={b.urlExample ?? ""}
                          onChange={(e) => updateButton(i, { urlExample: e.target.value })}
                          className={inputClass}
                          placeholder="Example URL — e.g. https://example.com/track/ABC123"
                        />
                      )}
                    </div>
                  )}

                  {(b.type === "PHONE_NUMBER" || b.type === "VOICE_CALL") && (
                    <div className="space-y-1 pl-1">
                      <input
                        value={b.phone ?? ""}
                        onChange={(e) => updateButton(i, { phone: e.target.value })}
                        className={cn(inputClass, buttonErrors[i] && "border-rose-400 focus:ring-rose-400")}
                        placeholder="+919876543210"
                      />
                      {buttonErrors[i] && (
                        <p className="flex items-center gap-1 text-[11px] text-rose-600">
                          <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />{buttonErrors[i]}
                        </p>
                      )}
                      {b.type === "VOICE_CALL" && !buttonErrors[i] && (
                        <p className="text-[11px] text-slate-400">Tapping opens a WhatsApp voice call to this number.</p>
                      )}
                    </div>
                  )}

                  {b.type === "COPY_CODE" && (
                    <div className="space-y-1 pl-1">
                      <input
                        value={b.text}
                        onChange={(e) => updateButton(i, { text: e.target.value })}
                        className={inputClass}
                        placeholder="Button label — e.g. Copy code"
                        maxLength={25}
                      />
                      <input
                        value={b.offerCode ?? ""}
                        onChange={(e) => updateButton(i, { offerCode: e.target.value })}
                        className={inputClass}
                        placeholder="Offer code — e.g. SAVE20"
                      />
                      <p className="text-[11px] text-slate-400">Customer taps to copy the offer code to clipboard.</p>
                    </div>
                  )}

                  {b.type === "OTP" && (
                    <p className="pl-1 text-xs text-slate-500">
                      Meta shows a &ldquo;Copy Code&rdquo; button. Pass the OTP as body variable{" "}
                      <code className="rounded bg-slate-100 px-1">{"{{1}}"}</code> — it fills both the body and the button automatically.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add button — dropdown shows only compatible types */}
          {(() => {
            const available = getAvailableButtonTypes(category, buttons);
            if (buttons.length >= 10 || available.length === 0) return null;
            return (
              <div className="mt-2">
                <select
                  className={cn(inputClass, "text-sm text-emerald-700 font-medium")}
                  value=""
                  onChange={(e) => {
                    const t = e.target.value as TemplateButton["type"];
                    if (!t) return;
                    setButtons((prev) => [
                      ...prev,
                      {
                        type: t,
                        text: "",
                        ...(t === "OTP"  ? { otpType: "COPY_CODE" as const } : {}),
                        ...(t === "URL"  ? { urlType: "STATIC"    as const } : {}),
                      },
                    ]);
                    // Reset select to placeholder
                    (e.target as HTMLSelectElement).value = "";
                  }}
                >
                  <option value="">+ Add button…</option>
                  {available.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            );
          })()}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>button]:h-10 [&>button]:w-full sm:[&>button]:h-9 sm:[&>button]:w-auto pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || !body.trim() || pending || hasDraftErrors}>
            {pending ? "Saving…" : editing ? "Save changes" : "Create draft"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
