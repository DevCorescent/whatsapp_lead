"use client";

// ============================================================================
// PAGE : Bulk Broadcast
//
// Paste numbers (or import a sheet) → validate / de-duplicate → review and remove
// recipients → pick an approved template, filling its variables from contact
// fields, sheet columns or fixed text → preview → send now or schedule, then watch
// it go out. No contacts or groups needed: the numbers travel as a `numbers`
// audience to POST /api/campaigns, which removes blacklisted and opted-out numbers,
// creates an ordinary campaign (so it also appears on the Campaigns page) and
// sends through the same QStash worker.
//
// Personalised messages: import a sheet like "Name | Mobile | Subject1 | …" and map
// {{name}} → Name, {{sub1}} → Subject1. Each row's values go only to that number.
// ============================================================================

import { useDeferredValue, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Eraser,
  FileSpreadsheet,
  Info,
  Loader2,
  Megaphone,
  Send,
  Sparkles,
  Table2,
  Trash2,
  XCircle,
} from "lucide-react";
import type { CampaignStatus } from "@prisma/client";
import { Badge, Button, Card, Field, Modal, PageHeader, inputClass } from "@/components/ui";
import { HeaderMediaInput, type MediaHeaderType } from "@/components/campaigns/HeaderMediaInput";
import {
  ExcludedSummary,
  RecipientReview,
  type ExclusionReport,
} from "@/components/campaigns/RecipientReview";
import { useTemplates, type TemplateDTO } from "@/hooks/useTemplates";
import {
  analyzeNumbers,
  BROADCAST_MAX_NUMBERS,
  DEFAULT_COUNTRY_CODE,
  normalizeBroadcastNumber,
  splitNumberInput,
} from "@/lib/broadcast";
import {
  detectBodyVarSlots,
  extractBodyVarNames,
  FIELD_PREFIX,
  renderTemplateBody,
  resolveBodyParams,
  unsupportedTemplateReason,
} from "@/lib/campaigns/templateVars";
import type { RawRow } from "@/lib/import";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

/** "custom" (fixed text), a contact field, or `field:<sheet column>`. */
type VarSource = string;

const VAR_SOURCES: { value: VarSource; label: string }[] = [
  { value: "custom", label: "Custom text" },
  { value: "name", label: "Name (contact or sheet)" },
  { value: "phone", label: "Phone number" },
  { value: "company", label: "Contact company" },
];

/** Columns and per-number values from imported sheets, for personalised variables. */
interface SheetData {
  fileNames: string[];
  columns: string[];
  /** Normalised phone → that row's cells, by column name. First row per number wins. */
  rows: Map<string, Record<string, string>>;
}

interface BroadcastPayload {
  name: string;
  templateId: string;
  bodyVarMapping: string[];
  numbers: string[];
  recipientFields?: Record<string, Record<string, string>>;
  defaultCountryCode: string;
  scheduledAt?: string;
  headerMediaId?: string;
  headerMediaUrl?: string;
  dryRun?: boolean;
}

interface DryRunResult extends ExclusionReport {
  total: number;
  matched: number;
  duplicates: number;
  scheduledAt: string | null;
  sample: { phone: string; bodyParams: string[] };
  cost: { units: number; unitPriceMinor: number; estimatedCostMinor: number; balanceMinor: number };
}

const inr = (minor: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(minor / 100);

interface LaunchResult extends Partial<ExclusionReport> {
  campaignId: string;
  total: number;
  scheduledAt?: string;
}

interface CampaignRow {
  id: string;
  status: CampaignStatus;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  deliveredCount: number;
  readCount: number;
  scheduledAt: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PHONE_HEADER = /phone|mobile|whats\s?app|number|contact|cell|msisdn/i;

/**
 * Read a parsed sheet: the phone column (a header that names it, else the column
 * with the most phone-like values) plus every other column, for personalisation.
 *
 * A header cell that is itself a phone number means the file had no header row:
 * its first row is kept as data and the other columns get generic names.
 */
function readSheet(headers: string[], rows: RawRow[], countryCode: string) {
  const looksLikePhone = (v: unknown) => normalizeBroadcastNumber(String(v ?? ""), countryCode).ok;

  let phoneCol = headers.find((h) => PHONE_HEADER.test(h) && !looksLikePhone(h)) ?? null;
  if (!phoneCol) {
    let best = 0;
    for (const h of headers) {
      const hits = rows.filter((r) => looksLikePhone(r[h])).length + (looksLikePhone(h) ? 1 : 0);
      if (hits > best) { best = hits; phoneCol = h; }
    }
  }
  if (!phoneCol) return null;

  const headerless = looksLikePhone(phoneCol);
  const dataRows: RawRow[] = headerless
    ? [Object.fromEntries(headers.map((h) => [h, h])), ...rows]
    : rows;
  const otherCols = headers.filter((h) => h !== phoneCol);
  const colName = (h: string, i: number) => (headerless ? `Column ${i + 1}` : h);

  const numbers: string[] = [];
  const fields = new Map<string, Record<string, string>>();
  for (const row of dataRows) {
    const raw = String(row[phoneCol] ?? "").trim();
    if (!raw) continue;
    numbers.push(raw);
    const n = normalizeBroadcastNumber(raw, countryCode);
    if (n.ok && !fields.has(n.phone)) {
      fields.set(
        n.phone,
        Object.fromEntries(otherCols.map((h, i) => [colName(h, i), String(row[h] ?? "").trim()])),
      );
    }
  }
  return { numbers, columns: otherCols.map(colName), fields };
}

/** "Subject 1" / "subject_1" / "SUB1" → "subject1": how a {{variable}} is matched to a column. */
function looseKey(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function defaultCampaignName() {
  const stamp = new Date().toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
  return `Broadcast – ${stamp}`;
}

/** Whether a moment has already passed. Only called from event handlers, never render. */
function isPast(date: Date) {
  return date.getTime() <= Date.now();
}

/** `datetime-local` value for "now", so the picker can't offer the past. */
function localNowInputValue() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

async function postBroadcast<T>(payload: BroadcastPayload): Promise<T> {
  const res = await fetch("/api/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.error ?? "Request failed");
  return json.data as T;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BroadcastPage() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  // 1. Numbers
  const [numbersText, setNumbersText] = useState("");
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [sheet, setSheet] = useState<SheetData | null>(null);
  // Recipients left out on the review list, by normalised number. Only affects this
  // send — the numbers' contacts (if any) are untouched.
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  // 2. Template
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [varSource, setVarSource] = useState<VarSource[]>([]);
  const [varText, setVarText] = useState<string[]>([]);
  const [media, setMedia] = useState({ mediaId: "", mediaUrl: "" });

  // 4. Send
  const [scheduling, setScheduling] = useState(false);
  const [schedule, setSchedule] = useState("");
  const [confirm, setConfirm] = useState<{ payload: BroadcastPayload; review: DryRunResult } | null>(null);
  const [launch, setLaunch] = useState<LaunchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Analysis runs on every keystroke; deferring it keeps typing smooth on a
  // paste of several thousand lines.
  const deferredText = useDeferredValue(numbersText);
  const analysis = analyzeNumbers(splitNumberInput(deferredText), countryCode);
  const finalNumbers = analysis.valid.filter((p) => !removed.has(p));
  const overLimit = finalNumbers.length > BROADCAST_MAX_NUMBERS;

  const { data: templatesData, isLoading: tplLoading } = useTemplates();
  const approved = (templatesData ?? []).filter((t) => t.status === "APPROVED");
  const template: TemplateDTO | null = approved.find((t) => t.id === templateId) ?? null;
  // What the variable inputs belong to.
  const chosenId = template?.id ?? null;
  const templateName = template?.name;

  const slotCount = detectBodyVarSlots(template?.body ?? "");
  const slotNames = extractBodyVarNames(template?.body ?? "");
  const mediaHeader =
    template?.headerType === "IMAGE" || template?.headerType === "VIDEO" || template?.headerType === "DOCUMENT"
      ? (template.headerType as MediaHeaderType)
      : null;

  const columns = sheet?.columns ?? [];
  const sourceOptions = [
    ...VAR_SOURCES,
    ...columns.map((c) => ({ value: `${FIELD_PREFIX}${c}`, label: `Sheet column: ${c}` })),
  ];

  /** Best guess for a variable: a sheet column with the same name, else the contact name, else text. */
  function autoSource(slotName: string | undefined, cols: string[]): VarSource {
    if (!slotName) return "custom";
    const col = cols.find((c) => looseKey(c) === looseKey(slotName));
    if (col) return `${FIELD_PREFIX}${col}`;
    return looseKey(slotName) === "name" ? "name" : "custom";
  }

  // Re-seed the variable inputs during render when the template changes — slot 1
  // of one template means nothing in another. Same pattern as the campaign modal.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (chosenId !== seededFor) {
    setSeededFor(chosenId);
    setVarSource(Array.from({ length: slotCount }, (_, i) => autoSource(slotNames[i], columns)));
    setVarText(Array.from({ length: slotCount }, () => ""));
    setMedia({ mediaId: "", mediaUrl: "" });
  }

  const bodyVarMapping = varSource.map((src, i) => (src === "custom" ? (varText[i] ?? "").trim() : src));
  const missingVar = varSource.some((src, i) => src === "custom" && !(varText[i] ?? "").trim());
  const usedColumns = varSource.filter((s) => s.startsWith(FIELD_PREFIX)).map((s) => s.slice(FIELD_PREFIX.length));
  const withoutSheetData = usedColumns.length ? finalNumbers.filter((p) => !sheet?.rows.has(p)).length : 0;

  const scheduleDate = schedule ? new Date(schedule) : null;
  // "Is it in the future" is checked on click, not here: render must not read the clock.
  const scheduleInvalid = scheduling && (!scheduleDate || Number.isNaN(scheduleDate.getTime()));

  const blockers: string[] = [];
  if (analysis.valid.length === 0) blockers.push("Add at least one valid number");
  else if (finalNumbers.length === 0) blockers.push("Every recipient has been removed — restore at least one");
  if (overLimit) blockers.push(`Too many numbers — the limit is ${BROADCAST_MAX_NUMBERS.toLocaleString()} per broadcast`);
  if (!template) blockers.push("Select an approved template");
  if (mediaHeader && !media.mediaId && !media.mediaUrl.trim()) blockers.push(`Add the template's ${mediaHeader.toLowerCase()}`);
  if (missingVar) blockers.push("Fill in every template variable");
  if (scheduleInvalid) blockers.push("Pick a date and time to schedule");

  // ── Preview values (live, client-side, first recipient) ──
  const first = finalNumbers[0];
  const firstFields = first ? sheet?.rows.get(first) ?? null : null;
  const sampleNumber = first ? `+${first}` : "+91XXXXXXXXXX";
  const previewValues = resolveBodyParams(
    bodyVarMapping.map((m, i) => (varSource[i] === "custom" && !m ? `{{${slotNames[i] ?? i + 1}}}` : m)),
    {
      phone: sampleNumber,
      name: firstFields?.Name ?? firstFields?.name ?? "[contact name]",
      company: "[company]",
      fields: firstFields,
    },
  );

  // ── Mutations ──

  const review = useMutation({
    mutationFn: (payload: BroadcastPayload) => postBroadcast<DryRunResult>({ ...payload, dryRun: true }),
    onSuccess: (data, payload) => setConfirm({ payload, review: data }),
    onError: (err: Error) => setError(err.message),
  });

  const send = useMutation({
    mutationFn: (payload: BroadcastPayload) => postBroadcast<LaunchResult>(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      setConfirm(null);
      setLaunch(data);
    },
    onError: (err: Error) => { setConfirm(null); setError(err.message); },
  });

  /** Only the columns the template uses (plus Name, the server's name fallback) travel. */
  function recipientFieldsFor(numbers: string[]) {
    if (!sheet || (usedColumns.length === 0 && !varSource.includes("name"))) return undefined;
    const keep = [...new Set([...usedColumns, "Name", "name"])];
    const out: Record<string, Record<string, string>> = {};
    for (const p of numbers) {
      const row = sheet.rows.get(p);
      if (row) out[p] = Object.fromEntries(keep.filter((k) => k in row).map((k) => [k, row[k]]));
    }
    return out;
  }

  function startReview(asSchedule: boolean) {
    setError(null);
    if (asSchedule && !scheduling) { setScheduling(true); return; }
    if (blockers.length > 0 || !template) { setError(blockers[0] ?? "Complete the form first"); return; }
    if (asSchedule && scheduleDate && isPast(scheduleDate)) {
      setError("That time has already passed — pick a future date and time, or use Send now.");
      return;
    }
    const recipientFields = recipientFieldsFor(finalNumbers);
    review.mutate({
      name: name.trim() || defaultCampaignName(),
      templateId: template.id,
      bodyVarMapping,
      numbers: finalNumbers,
      ...(recipientFields && { recipientFields }),
      defaultCountryCode: countryCode,
      ...(asSchedule && scheduleDate && { scheduledAt: scheduleDate.toISOString() }),
      ...(media.mediaId && { headerMediaId: media.mediaId }),
      ...(!media.mediaId && media.mediaUrl.trim() && { headerMediaUrl: media.mediaUrl.trim() }),
    });
  }

  async function importFile(file: File) {
    setImporting(true);
    setImportNote(null);
    try {
      // Loaded on demand: SheetJS is large and most broadcasts are pasted, not imported.
      const { parseSpreadsheet } = await import("@/lib/spreadsheet");
      const { headers, rows } = await parseSpreadsheet(file);
      const result = readSheet(headers, rows, countryCode);
      if (!result || result.numbers.length === 0) {
        setImportNote(`No phone number column found in ${file.name}.`);
        return;
      }
      setNumbersText((prev) => [prev.trim(), ...result.numbers].filter(Boolean).join("\n"));

      if (result.columns.length > 0) {
        const merged: SheetData = {
          fileNames: [...(sheet?.fileNames ?? []), file.name],
          columns: [...new Set([...(sheet?.columns ?? []), ...result.columns])],
          rows: new Map(sheet?.rows),
        };
        for (const [phone, fields] of result.fields) if (!merged.rows.has(phone)) merged.rows.set(phone, fields);
        setSheet(merged);
        // Variables not filled in yet pick up matching columns ({{sub1}} → "Sub1").
        setVarSource((prev) =>
          prev.map((src, i) => (src === "custom" && !(varText[i] ?? "").trim() ? autoSource(slotNames[i], merged.columns) : src)),
        );
      }
      setImportNote(
        `Added ${result.numbers.length.toLocaleString()} entries from ${file.name}` +
          (result.columns.length
            ? `, with columns ${result.columns.join(", ")} — use them as template variables in step 2.`
            : "."),
      );
    } catch {
      setImportNote(`Couldn't read ${file.name}. Use a .csv, .xlsx or .xls file.`);
    } finally {
      setImporting(false);
    }
  }

  function clearNumbers() {
    setNumbersText("");
    setImportNote(null);
    setSheet(null);
    setRemoved(new Set());
  }

  function reset() {
    setLaunch(null);
    clearNumbers();
    setName("");
    setTemplateId("");
    setScheduling(false);
    setSchedule("");
    setError(null);
  }

  if (launch) return <BroadcastProgress launch={launch} onNew={reset} />;

  return (
    <div>
      <PageHeader
        title="Bulk Broadcast"
        description="Paste WhatsApp numbers and send an approved template — no contacts or groups needed."
        action={
          <Link href="/campaigns" className="text-sm font-medium text-emerald-700 hover:text-emerald-900">
            View campaigns →
          </Link>
        }
      />

      {/* Compose on the left; preview and send stay in view on the right. */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-5">
        {/* ── 1. Numbers ─────────────────────────────────────────────────── */}
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <SectionTitle step={1} title="Numbers" className="mb-0" />
            <label htmlFor="bc-cc" className="flex items-center gap-2 text-xs font-medium text-slate-600">
              Default country code
              <span className="flex w-20 items-center rounded-lg bg-white shadow-sm ring-1 ring-inset ring-slate-200 focus-within:ring-2 focus-within:ring-emerald-500">
                <span className="pl-2.5 text-sm text-slate-400">+</span>
                <input
                  id="bc-cc"
                  inputMode="numeric"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="w-full rounded-lg bg-transparent px-1 py-1.5 text-sm text-slate-900 focus:outline-none"
                />
              </span>
            </label>
          </div>

          <textarea
            value={numbersText}
            onChange={(e) => setNumbersText(e.target.value)}
            rows={9}
            spellCheck={false}
            className={cn(inputClass, "resize-y font-mono text-[13px] leading-relaxed")}
            placeholder={"Paste numbers here, one per line\n+91 98765 43210\n9876543210\n09123456789"}
            aria-label="Phone numbers"
          />
          <p className="mt-1.5 text-xs text-slate-500">
            One number per line. Numbers without a country code get +{countryCode || "…"}, e.g.
            98765 43210 → +{countryCode || "…"} 98765 43210.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Total" value={analysis.total} />
            <Stat label="Valid" value={analysis.valid.length} tone="emerald" />
            <Stat label="Invalid" value={analysis.invalid.length} tone={analysis.invalid.length ? "rose" : undefined} />
            <Stat label="Duplicate" value={analysis.duplicates} tone={analysis.duplicates ? "amber" : undefined} />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => fileInput.current?.click()} disabled={importing}>
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
              Import CSV / Excel
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={analysis.invalid.length === 0 && analysis.duplicates === 0}
              onClick={() => setNumbersText(analysis.valid.map((p) => `+${p}`).join("\n"))}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Remove duplicates &amp; invalid
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={!numbersText} onClick={clearNumbers}>
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </Button>
            <input
              ref={fileInput}
              type="file"
              className="sr-only"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFile(f);
                e.target.value = "";
              }}
            />
          </div>

          {importNote && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
              <Info className="h-3.5 w-3.5 shrink-0" />
              {importNote}
            </p>
          )}

          {overLimit && (
            <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {finalNumbers.length.toLocaleString()} recipients — one broadcast can send to at most{" "}
              {BROADCAST_MAX_NUMBERS.toLocaleString()}. Split the list into several broadcasts.
            </p>
          )}

          {analysis.invalid.length > 0 && (
            <details className="mt-3 rounded-lg bg-rose-50/60 px-3 py-2 text-xs ring-1 ring-inset ring-rose-100">
              <summary className="cursor-pointer font-medium text-rose-700">
                {analysis.invalid.length} invalid {analysis.invalid.length === 1 ? "entry" : "entries"} won&apos;t be sent
              </summary>
              <ul className="scrollbar-slim mt-2 max-h-40 space-y-1 overflow-y-auto">
                {analysis.invalid.slice(0, 100).map((row, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="truncate font-mono text-slate-700">{row.raw}</span>
                    <span className="shrink-0 text-rose-600">{row.reason}</span>
                  </li>
                ))}
                {analysis.invalid.length > 100 && (
                  <li className="text-slate-500">…and {analysis.invalid.length - 100} more</li>
                )}
              </ul>
            </details>
          )}

          {sheet && (
            <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 ring-1 ring-inset ring-sky-100">
              <Table2 className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>
                Personalisation data from {sheet.fileNames.join(", ")}: columns{" "}
                <span className="font-medium">{sheet.columns.join(", ")}</span> for{" "}
                {sheet.rows.size.toLocaleString()} numbers. Map them to template variables in step 3.
              </span>
            </p>
          )}
        </Card>

        {/* ── 2. Review ──────────────────────────────────────────────────── */}
        {analysis.valid.length > 0 && (
          <Card className="p-5">
            <SectionTitle step={2} title="Review recipients" />
            <RecipientReview
              items={analysis.valid.map((phone) => {
                const row = sheet?.rows.get(phone);
                return { key: phone, phone, name: row?.Name ?? row?.name ?? null };
              })}
              removed={removed}
              onRemovedChange={setRemoved}
            />
          </Card>
        )}

        {/* ── 3. Template ────────────────────────────────────────────────── */}
        <Card className="space-y-4 p-5">
          <SectionTitle step={3} title="Message" className="mb-0" />

          <div className="grid gap-4 md:grid-cols-2">
          <Field label="Campaign name" htmlFor="bc-name">
            <input
              id="bc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="Optional — defaults to today's date and time"
            />
          </Field>

          <div>
            <label htmlFor="bc-tpl" className="mb-1.5 block text-sm font-medium text-slate-700">
              WhatsApp template <span className="text-rose-500">*</span>
            </label>
            {tplLoading ? (
              <div className={cn(inputClass, "flex items-center gap-2 text-slate-400")}>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading templates…
              </div>
            ) : approved.length === 0 ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  No approved templates yet. WhatsApp only allows messages to people who haven&apos;t
                  messaged you in the last 24 hours through Meta-approved templates.{" "}
                  <Link href="/templates" className="underline hover:text-amber-900">
                    Create and submit a template →
                  </Link>
                </span>
              </div>
            ) : (
              <select
                id="bc-tpl"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className={inputClass}
              >
                <option value="">— Select an approved template —</option>
                {approved.map((t) => {
                  const unsupported = unsupportedTemplateReason(t);
                  return (
                    <option key={t.id} value={t.id} disabled={!!unsupported} title={unsupported ?? undefined}>
                      [{t.category}] {t.name} ({t.language}){unsupported ? " — not supported" : ""}
                    </option>
                  );
                })}
              </select>
            )}
          </div>
          </div>
          <p className="-mt-2 flex items-start gap-1 text-xs text-slate-500">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            Only Meta-approved templates can be broadcast. Free-text messages are only allowed inside a customer&apos;s 24-hour reply window.
          </p>

          {mediaHeader && template && (
            <HeaderMediaInput
              key={template.id}
              headerType={mediaHeader}
              value={media}
              onChange={setMedia}
              onError={setError}
            />
          )}

          {slotCount > 0 && (
            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Template variables</span>
              <div className="space-y-2">
                {varSource.map((src, i) => (
                  <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <span className="w-24 shrink-0 font-mono text-[11px] text-slate-500">
                      {`{{${slotNames[i] ?? i + 1}}}`}
                    </span>
                    <select
                      value={src}
                      onChange={(e) =>
                        setVarSource((prev) => prev.map((v, j) => (j === i ? (e.target.value as VarSource) : v)))
                      }
                      className={cn(inputClass, "sm:w-56")}
                      aria-label={`Source for variable ${i + 1}`}
                    >
                      {sourceOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {src === "custom" && (
                      <input
                        value={varText[i] ?? ""}
                        onChange={(e) => setVarText((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                        className={inputClass}
                        placeholder="Text sent to everyone"
                        aria-label={`Text for variable ${i + 1}`}
                      />
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-1.5 flex items-start gap-1 text-[11px] text-slate-400">
                <Info className="mt-px h-3 w-3 shrink-0" />
                Name comes from the saved contact, else the sheet&apos;s Name column. Sheet columns give
                each number its own value (e.g. marks). Custom text is the same for everyone. A missing
                value is sent as “-”.
              </p>
              {withoutSheetData > 0 && (
                <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {withoutSheetData.toLocaleString()} recipient{withoutSheetData === 1 ? " isn't" : "s aren't"} in
                  the imported sheet, so sheet-column variables will be “-” for them.
                </p>
              )}
            </div>
          )}
        </Card>
        </div>

        <div className="min-w-0 space-y-5 lg:sticky lg:top-0">
        {/* ── 3. Preview ─────────────────────────────────────────────────── */}
        <Card className="p-5">
          <SectionTitle step={4} title="Preview" />
          {template ? (
            <MessagePreview template={template} values={previewValues} caption={`Sample for ${sampleNumber}`} />
          ) : (
            <p className="text-sm text-slate-500">Select a template to see the message your recipients will get.</p>
          )}
        </Card>

        {/* ── 4. Send ────────────────────────────────────────────────────── */}
        <Card className="p-5">
          <SectionTitle step={5} title="Send" />

          <dl className="mb-4 space-y-1.5 rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Recipients</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{finalNumbers.length.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">WhatsApp template</dt>
              <dd className="truncate font-medium text-slate-900">{templateName ?? "—"}</dd>
            </div>
          </dl>

          {scheduling && (
            <div className="mb-4">
              <Field label="Send at" htmlFor="bc-when" required>
                <input
                  id="bc-when"
                  type="datetime-local"
                  value={schedule}
                  min={localNowInputValue()}
                  onChange={(e) => setSchedule(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <button
                type="button"
                className="mt-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
                onClick={() => { setScheduling(false); setSchedule(""); }}
              >
                Cancel scheduling
              </button>
            </div>
          )}

          {error && (
            <p className="mb-3 flex items-start gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>
                {error}
                {/balance/i.test(error) && (
                  <> <Link href="/wallet" className="font-medium underline">Top up →</Link></>
                )}
              </span>
            </p>
          )}

          {blockers.length > 0 && !error && (
            <p className="mb-3 flex items-center gap-1.5 text-xs text-slate-500">
              <Info className="h-3.5 w-3.5 shrink-0" />
              {blockers[0]}
            </p>
          )}

          <div className="flex flex-col gap-2">
            {!scheduling && (
              <Button
                className="w-full"
                disabled={blockers.length > 0 || review.isPending}
                onClick={() => startReview(false)}
              >
                {review.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send now{finalNumbers.length > 0 && ` to ${finalNumbers.length.toLocaleString()}`}
              </Button>
            )}
            <Button
              variant={scheduling ? "primary" : "secondary"}
              className="w-full"
              disabled={scheduling ? blockers.length > 0 || review.isPending : false}
              onClick={() => startReview(true)}
            >
              {scheduling && review.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarClock className="h-4 w-4" />
              )}
              Schedule broadcast
            </Button>
          </div>
        </Card>
        </div>
      </div>

      {/* ── Confirmation (server-verified) ─────────────────────────────── */}
      <Modal
        open={!!confirm}
        onClose={() => !send.isPending && setConfirm(null)}
        title={confirm?.payload.scheduledAt ? "Schedule this broadcast?" : "Send this broadcast?"}
        description="Messages that reach customers can't be recalled."
      >
        {confirm && template && (
          <div className="space-y-4">
            <ul className="space-y-1.5 text-sm text-slate-700">
              <li className="flex justify-between gap-3">
                <span>Recipients</span>
                <span className="font-semibold tabular-nums">{confirm.review.total.toLocaleString()}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span>Already saved as contacts</span>
                <span className="tabular-nums">{confirm.review.matched.toLocaleString()}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span>Template</span>
                <span className="truncate font-medium">{templateName}</span>
              </li>
              {confirm.review.cost.estimatedCostMinor > 0 && (
                <li className="flex justify-between gap-3">
                  <span>
                    Estimated cost
                    <span className="block text-xs text-slate-500">
                      {confirm.review.cost.units.toLocaleString()} messages × {inr(confirm.review.cost.unitPriceMinor)}
                    </span>
                  </span>
                  <span className="text-right font-semibold tabular-nums">
                    {inr(confirm.review.cost.estimatedCostMinor)}
                    <span className="block text-xs font-normal text-slate-500">balance {inr(confirm.review.cost.balanceMinor)}</span>
                  </span>
                </li>
              )}
              <li className="flex justify-between gap-3">
                <span>When</span>
                <span className="font-medium">
                  {confirm.review.scheduledAt
                    ? new Date(confirm.review.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
                    : "Immediately"}
                </span>
              </li>
            </ul>

            <ExcludedSummary report={confirm.review} />

            <MessagePreview
              template={template}
              values={confirm.review.sample.bodyParams}
              caption={`Exactly as sent to +${confirm.review.sample.phone}`}
            />

            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
              <Info className="mt-px h-3 w-3 shrink-0" />
              Send only to people who agreed to hear from you. Recipients who report or block your number lower its quality rating, and Meta can limit it.
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirm(null)} disabled={send.isPending}>
                Cancel
              </Button>
              <Button onClick={() => send.mutate(confirm.payload)} disabled={send.isPending}>
                {send.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Queuing…</>
                ) : confirm.payload.scheduledAt ? (
                  <><CalendarClock className="h-4 w-4" /> Schedule</>
                ) : (
                  <><Send className="h-4 w-4" /> Send to {confirm.review.total.toLocaleString()}</>
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function SectionTitle({ step, title, className }: { step: number; title: string; className?: string }) {
  return (
    <h2 className={cn("mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900", className)}>
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-semibold text-white">
        {step}
      </span>
      {title}
    </h2>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "emerald" | "rose" | "amber" | "slate" }) {
  return (
    <div
      className={cn(
        "rounded-lg px-3 py-2 ring-1 ring-inset",
        tone === "emerald" && "bg-emerald-50 text-emerald-800 ring-emerald-100",
        tone === "rose" && "bg-rose-50 text-rose-700 ring-rose-100",
        tone === "amber" && "bg-amber-50 text-amber-800 ring-amber-100",
        (!tone || tone === "slate") && "bg-slate-50 text-slate-700 ring-slate-100",
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}

/** The template as a WhatsApp chat bubble, with its variables filled in. */
function MessagePreview({ template, values, caption }: { template: TemplateDTO; values: string[]; caption: string }) {
  const buttons = Array.isArray(template.buttons) ? template.buttons : [];
  return (
    <div className="rounded-xl bg-[#efeae2] p-3 sm:p-4">
      <div className="max-w-sm rounded-lg rounded-tl-none bg-white p-2.5 shadow-sm">
        {template.headerType === "TEXT" && template.headerContent && (
          <p className="mb-1 text-sm font-semibold text-slate-900">{template.headerContent}</p>
        )}
        {template.headerType && template.headerType !== "TEXT" && (
          <div className="mb-2 flex h-28 items-center justify-center rounded-md bg-slate-100 text-xs font-medium text-slate-500">
            {template.headerType === "IMAGE" ? "🖼 Image" : template.headerType === "VIDEO" ? "🎬 Video" : "📄 Document"}
          </div>
        )}
        <p className="whitespace-pre-wrap break-words text-sm text-slate-800">
          {renderTemplateBody(template.body, values)}
        </p>
        {template.footer && <p className="mt-1 text-xs text-slate-400">{template.footer}</p>}
        {buttons.length > 0 && (
          <div className="mt-2 divide-y divide-slate-100 border-t border-slate-100">
            {buttons.map((b, i) => (
              <p key={i} className="py-1.5 text-center text-sm font-medium text-sky-600">
                {b.text || b.type}
              </p>
            ))}
          </div>
        )}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">{caption}</p>
    </div>
  );
}

const DONE: CampaignStatus[] = ["COMPLETED", "SENT", "FAILED", "CANCELLED"];

/**
 * Live progress for a launched broadcast. Polls the campaigns list (a light summary
 * row) rather than the detail route, which returns every recipient; the detail is
 * read once, at the end, for the failure reasons.
 */
function BroadcastProgress({ launch, onNew }: { launch: LaunchResult; onNew: () => void }) {
  const { data: row } = useQuery<CampaignRow | null>({
    queryKey: ["campaigns", "broadcast-progress", launch.campaignId],
    queryFn: async () => {
      const res = await fetch("/api/campaigns");
      if (!res.ok) throw new Error("Failed to load progress");
      const json = await res.json();
      const list = (json.data ?? []) as CampaignRow[];
      return list.find((c) => c.id === launch.campaignId) ?? null;
    },
    refetchInterval: (query) => {
      const c = query.state.data;
      if (!c) return 3000;
      if (DONE.includes(c.status) || c.sentCount + c.failedCount >= c.totalCount) return false;
      // A scheduled broadcast has nothing to report until it is due.
      if (c.status === "SCHEDULED" && c.scheduledAt && new Date(c.scheduledAt).getTime() > Date.now()) return 30_000;
      return 3000;
    },
  });

  const total = row?.totalCount ?? launch.total;
  const sent = row?.sentCount ?? 0;
  const failed = row?.failedCount ?? 0;
  const processed = sent + failed;
  const finished = !!row && (DONE.includes(row.status) || processed >= total);
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  // Scheduled and nothing has gone out yet. The server only returns `scheduledAt` for a
  // time still in the future, so this needs no clock read.
  const waiting = !!launch.scheduledAt && processed === 0 && !finished;

  const { data: failures } = useQuery<{ phone: string; failedReason: string | null }[]>({
    queryKey: ["campaigns", launch.campaignId, "failures"],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${launch.campaignId}`);
      if (!res.ok) return [];
      const json = await res.json();
      const recipients = (json.data?.recipients ?? []) as { phone: string; status: string; failedReason: string | null }[];
      return recipients.filter((r) => r.status === "FAILED");
    },
    enabled: finished && failed > 0,
  });

  return (
    <div>
      <PageHeader title="Bulk Broadcast" description="Your broadcast is on its way." />
      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          {waiting ? (
            <CalendarClock className="h-8 w-8 text-sky-600" />
          ) : finished ? (
            failed === total ? <XCircle className="h-8 w-8 text-rose-600" /> : <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          ) : (
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          )}
          <div className="min-w-0">
            <p className="text-base font-semibold text-slate-900">
              {waiting
                ? "Broadcast scheduled"
                : finished
                  ? "Broadcast finished"
                  : "Sending…"}
            </p>
            <p className="text-sm text-slate-500">
              {waiting && launch.scheduledAt
                ? `Goes out ${new Date(launch.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}. You can leave this page.`
                : finished
                  ? `${sent.toLocaleString()} of ${total.toLocaleString()} accepted by WhatsApp.`
                  : "You can leave this page — sending continues in the background."}
            </p>
          </div>
          {row && <Badge className="ml-auto shrink-0">{row.status}</Badge>}
        </div>

        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="flex h-full">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${total ? (sent / total) * 100 : 0}%` }} />
            <div className="h-full bg-rose-500 transition-all" style={{ width: `${total ? (failed / total) * 100 : 0}%` }} />
          </div>
        </div>
        <p className="mt-1.5 text-right text-xs tabular-nums text-slate-500">{pct}%</p>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Total" value={total} />
          <Stat label="Success" value={sent} tone="emerald" />
          <Stat label="Failed" value={failed} tone={failed ? "rose" : undefined} />
          <Stat label="Pending" value={Math.max(total - processed, 0)} tone="slate" />
        </div>

        {row && (row.deliveredCount > 0 || row.readCount > 0) && (
          <p className="mt-3 text-xs text-slate-500">
            {row.deliveredCount.toLocaleString()} delivered · {row.readCount.toLocaleString()} read so far
          </p>
        )}

        {!!launch.excludedCount && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-700">
            <Info className="h-3.5 w-3.5 shrink-0" />
            {launch.excludedCount} blacklisted or opted-out {launch.excludedCount === 1 ? "number was" : "numbers were"} skipped.
          </p>
        )}

        {failures && failures.length > 0 && (
          <details className="mt-4 rounded-lg bg-rose-50/60 px-3 py-2 text-xs ring-1 ring-inset ring-rose-100">
            <summary className="cursor-pointer font-medium text-rose-700">Why {failures.length} failed</summary>
            <ul className="scrollbar-slim mt-2 max-h-48 space-y-1 overflow-y-auto">
              {failures.slice(0, 200).map((f, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="shrink-0 font-mono text-slate-700">+{f.phone}</span>
                  <span className="truncate text-rose-600" title={f.failedReason ?? undefined}>
                    {f.failedReason ?? "Unknown error"}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Link
            href="/campaigns"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-white px-3.5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
          >
            <Megaphone className="h-4 w-4" />
            View in Campaigns
          </Link>
          <Button onClick={onNew}>
            <Eraser className="h-4 w-4" />
            New broadcast
          </Button>
        </div>
      </Card>
    </div>
  );
}
