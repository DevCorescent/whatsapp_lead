"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { cn } from "@/lib/utils";
import { parseSpreadsheet } from "@/lib/spreadsheet";
import {
  IMPORT_MAX_ROWS,
  autoMapHeaders,
  type ColumnMapping,
  type ImportField,
  type ImportMode,
  type ImportResult,
  type RawRow,
  type ValidatedRow,
  type ValidationSummary,
} from "@/lib/import";

/**
 * Everything an entity needs to drive the shared import flow. Contacts and Leads each
 * supply their own fields, validation and batch-import call; the wizard owns the UI —
 * upload, column mapping, validated preview, batched import with progress, and report.
 */
export interface ImportWizardConfig<T> {
  title: string;
  description: string;
  /** Mappable columns for this entity. */
  fields: ImportField[];
  /** Map + validate parsed rows (file-level rules) into the preview model. */
  validate: (rows: RawRow[], mapping: ColumnMapping) => ValidationSummary<T>;
  /** One client batch → server. `dryRun` reports the new/existing split without writing. */
  importBatch: (payload: T[], mode: ImportMode, dryRun: boolean) => Promise<ImportResult>;
  /** Optional loading gate (e.g. Leads waiting on stage/user lists). */
  busy?: boolean;
  /** Optional guidance rendered under the mapping grid. */
  mappingHint?: ReactNode;
}

type Step = "upload" | "map" | "preview" | "importing" | "done";

/** Batch size for the client → server import loop; drives the real progress bar. */
const CLIENT_BATCH = 500;
const ACCEPT = ".xlsx,.xls,.csv";

export function ImportWizard<T>({
  open,
  onClose,
  config,
}: {
  open: boolean;
  onClose: () => void;
  config: ImportWizardConfig<T>;
}) {
  if (!open) return null;
  return <ImportFlow onClose={onClose} config={config} />;
}

function ImportFlow<T>({ onClose, config }: { onClose: () => void; config: ImportWizardConfig<T> }) {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [mode, setMode] = useState<ImportMode>("skip");
  const [dbSplit, setDbSplit] = useState<{ newCount: number; existingCount: number } | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [running, setRunning] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  // Validation is derived from the file + mapping, so it updates live as columns are remapped.
  const validation = useMemo(
    () => (mapping ? config.validate(rows, mapping) : null),
    [rows, mapping, config],
  );
  const validPayload = useMemo(
    () => validation?.rows.filter((r) => r.isValid).map((r) => r.payload) ?? [],
    [validation],
  );

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setParsing(true);
    try {
      const { headers: h, rows: r } = await parseSpreadsheet(file);
      if (h.length === 0 || r.length === 0) {
        setError("That file has no rows we can read. Check it has a header row and at least one data row.");
        return;
      }
      if (r.length > IMPORT_MAX_ROWS) {
        setError(`This file has ${r.length.toLocaleString()} rows — the limit is ${IMPORT_MAX_ROWS.toLocaleString()} per import.`);
        return;
      }
      setFileName(file.name);
      setHeaders(h);
      setRows(r);
      setMapping(autoMapHeaders(config.fields, h));
      setStep("map");
    } catch {
      setError("Couldn't read that file. Supported formats are .xlsx, .xls and .csv.");
    } finally {
      setParsing(false);
    }
  }

  function setField(field: string, header: string) {
    setMapping((m) => (m ? { ...m, [field]: header || null } : m));
  }

  async function goToPreview() {
    setError(null);
    setRunning(true);
    try {
      const preview = await config.importBatch(validPayload, mode, true);
      setDbSplit({ newCount: preview.newCount ?? 0, existingCount: preview.existingCount ?? 0 });
      setStep("preview");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function runImport() {
    setError(null);
    setStep("importing");
    setProgress({ done: 0, total: validPayload.length });

    const acc: ImportResult = { total: 0, created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
    try {
      for (let i = 0; i < validPayload.length; i += CLIENT_BATCH) {
        const batch = validPayload.slice(i, i + CLIENT_BATCH);
        const r = await config.importBatch(batch, mode, false);
        acc.total += r.total;
        acc.created += r.created;
        acc.updated += r.updated;
        acc.skipped += r.skipped;
        acc.failed += r.failed;
        if (acc.errors.length < 50) acc.errors.push(...r.errors.slice(0, 50 - acc.errors.length));
        setProgress({ done: Math.min(i + batch.length, validPayload.length), total: validPayload.length });
      }
      setResult(acc);
      setStep("done");
    } catch (e) {
      setError((e as Error).message || "Import failed partway through. Some rows may have been imported.");
      setResult(acc);
      setStep("done");
    }
  }

  // A required field is one the entity marked required; the primary key we gate "continue" on.
  const requiredField = config.fields.find((f) => f.required);
  const requiredMapped = !requiredField || Boolean(mapping?.[requiredField.key]);

  return (
    <Modal open onClose={onClose} title={config.title} description={config.description} className="max-w-3xl">
      {error && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {step === "upload" && (
        <div>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFile(e.dataTransfer.files?.[0]);
            }}
            className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center transition hover:border-emerald-400 hover:bg-emerald-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            {parsing ? (
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-emerald-600 ring-1 ring-slate-200">
                <Upload className="h-6 w-6" />
              </span>
            )}
            <span className="text-sm font-medium text-slate-800">
              {parsing ? "Reading file…" : "Click to choose a file, or drag it here"}
            </span>
            <span className="text-xs text-slate-500">Excel (.xlsx, .xls) or CSV · up to {IMPORT_MAX_ROWS.toLocaleString()} rows</span>
          </button>
          {config.mappingHint && <div className="mt-3 text-xs text-slate-500">{config.mappingHint}</div>}
        </div>
      )}

      {step === "map" && mapping && validation && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <FileSpreadsheet className="h-4 w-4 text-slate-400" />
            <span className="truncate font-medium text-slate-700">{fileName}</span>
            <span>· {rows.length.toLocaleString()} rows</span>
          </div>

          <p className="text-sm text-slate-600">
            Match your spreadsheet columns to fields. We&apos;ve guessed based on the headers — adjust anything that&apos;s off.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {config.fields.map((field) => (
              <label key={field.key} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-sm font-medium text-slate-700">
                  {field.label}
                  {field.required && <span className="ml-0.5 text-rose-500">*</span>}
                </span>
                <select
                  value={mapping[field.key] ?? ""}
                  onChange={(e) => setField(field.key, e.target.value)}
                  aria-label={`Column for ${field.label}`}
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="">— Not mapped —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {config.mappingHint && <div className="text-xs text-slate-500">{config.mappingHint}</div>}

          {!requiredMapped && requiredField && (
            <p className="text-xs font-medium text-rose-600">Map a {requiredField.label} column to continue.</p>
          )}

          <SummaryTiles validation={validation} />

          <div className="flex items-center justify-between border-t border-slate-200 pt-4">
            <Button variant="ghost" onClick={() => setStep("upload")}>
              <ArrowLeft className="h-4 w-4" />
              Choose another file
            </Button>
            <Button onClick={goToPreview} disabled={!requiredMapped || validation.valid === 0 || running || config.busy}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Preview {validation.valid.toLocaleString()} row{validation.valid === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      )}

      {step === "preview" && validation && dbSplit && (
        <div className="space-y-4">
          <SummaryTiles validation={validation} dbSplit={dbSplit} mode={mode} />

          <fieldset className="rounded-xl border border-slate-200 p-3">
            <legend className="px-1 text-xs font-medium text-slate-500">When a record already exists</legend>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              {(
                [
                  { value: "skip", title: "Skip duplicates", desc: "Only add new records. Existing ones are left unchanged." },
                  { value: "update", title: "Update existing", desc: "Overwrite matching records with the imported details." },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    "flex cursor-pointer gap-2.5 rounded-lg border p-3 transition",
                    mode === opt.value ? "border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500" : "border-slate-200 hover:border-slate-300",
                  )}
                >
                  <input type="radio" name="import-mode" value={opt.value} checked={mode === opt.value} onChange={() => setMode(opt.value)} className="mt-0.5 accent-emerald-600" />
                  <span>
                    <span className="block text-sm font-medium text-slate-800">{opt.title}</span>
                    <span className="block text-xs text-slate-500">{opt.desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <IssuesTable rows={validation.rows} />

          <div className="flex items-center justify-between border-t border-slate-200 pt-4">
            <Button variant="ghost" onClick={() => setStep("map")}>
              <ArrowLeft className="h-4 w-4" />
              Back to mapping
            </Button>
            <Button onClick={runImport} disabled={validation.valid === 0}>
              Import {validation.valid.toLocaleString()} row{validation.valid === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      )}

      {step === "importing" && (
        <div className="flex flex-col items-center gap-4 py-8">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="text-sm font-medium text-slate-700">
            Importing {progress.done.toLocaleString()} of {progress.total.toLocaleString()}…
          </p>
          <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
          </div>
        </div>
      )}

      {step === "done" && result && (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-7 w-7" />
            </span>
            <p className="text-base font-semibold text-slate-900">Import complete</p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ReportTile label="Created" value={result.created} tone="emerald" />
            <ReportTile label="Updated" value={result.updated} tone="sky" />
            <ReportTile label="Skipped" value={result.skipped} tone="slate" />
            <ReportTile label="Failed" value={result.failed} tone="rose" />
          </div>

          {result.errors.length > 0 && (
            <div className="rounded-lg border border-slate-200">
              <p className="border-b border-slate-100 px-3 py-2 text-xs font-medium text-slate-500">
                First {result.errors.length} issue{result.errors.length === 1 ? "" : "s"}
              </p>
              <ul className="scrollbar-slim max-h-40 divide-y divide-slate-100 overflow-y-auto text-xs">
                {result.errors.map((err, i) => (
                  <li key={i} className="flex items-center gap-2 px-3 py-1.5 text-slate-600">
                    <span className="font-mono text-slate-400">{err.ref ?? "—"}</span>
                    <span className="text-rose-600">{err.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end border-t border-slate-200 pt-4">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Bits ─────────────────────────────────────────────────────────────────────

function SummaryTiles<T>({
  validation,
  dbSplit,
  mode,
}: {
  validation: ValidationSummary<T>;
  dbSplit?: { newCount: number; existingCount: number };
  mode?: ImportMode;
}) {
  const tiles: { label: string; value: number; tone: Tone }[] = [
    { label: "Total rows", value: validation.total, tone: "slate" },
    { label: "Valid", value: validation.valid, tone: "emerald" },
    { label: "Invalid", value: validation.invalid, tone: "rose" },
    { label: "Duplicates in file", value: validation.duplicateInFile, tone: "amber" },
  ];
  if (dbSplit) {
    tiles.push({ label: "New", value: dbSplit.newCount, tone: "emerald" });
    tiles.push({
      label: mode === "skip" ? "Will skip" : "Will update",
      value: dbSplit.existingCount,
      tone: mode === "skip" ? "slate" : "sky",
    });
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {tiles.map((t) => (
        <ReportTile key={t.label} label={t.label} value={t.value} tone={t.tone} />
      ))}
    </div>
  );
}

type Tone = "emerald" | "rose" | "amber" | "sky" | "slate";

const TONE: Record<Tone, string> = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  rose: "bg-rose-50 text-rose-700 ring-rose-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  sky: "bg-sky-50 text-sky-700 ring-sky-600/20",
  slate: "bg-slate-50 text-slate-600 ring-slate-500/20",
};

function ReportTile({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  return (
    <div className={cn("rounded-lg px-3 py-2 text-center ring-1 ring-inset", TONE[tone])}>
      <p className="nums text-lg font-semibold">{value.toLocaleString()}</p>
      <p className="text-[11px] font-medium opacity-80">{label}</p>
    </div>
  );
}

/** Row-by-row list of the rows that have problems, so nothing fails silently. */
function IssuesTable<T>({ rows }: { rows: ValidatedRow<T>[] }) {
  const problems = rows.filter((r) => !r.isEmpty && (r.errors.length > 0 || r.isDuplicateInFile));
  if (problems.length === 0) {
    return (
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
        Every row looks good — no validation issues found.
      </p>
    );
  }

  const shown = problems.slice(0, 100);
  return (
    <div className="rounded-lg border border-slate-200">
      <p className="border-b border-slate-100 px-3 py-2 text-xs font-medium text-slate-500">
        {problems.length.toLocaleString()} row{problems.length === 1 ? "" : "s"} with issues
        {problems.length > shown.length ? ` (showing first ${shown.length})` : ""} — these are skipped
      </p>
      <div className="scrollbar-slim max-h-56 overflow-y-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-1.5 font-medium">Row</th>
              <th className="px-3 py-1.5 font-medium">Record</th>
              <th className="px-3 py-1.5 font-medium">Detail</th>
              <th className="px-3 py-1.5 font-medium">Issue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((r) => (
              <tr key={r.index} className="bg-rose-50/40">
                <td className="px-3 py-1.5 text-slate-400">{r.index + 2}</td>
                <td className="max-w-32 truncate px-3 py-1.5 text-slate-700">{r.display.primary}</td>
                <td className="px-3 py-1.5 font-mono text-slate-600">{r.display.secondary ?? "—"}</td>
                <td className="px-3 py-1.5 text-rose-600">
                  {[...r.errors, r.isDuplicateInFile ? "Duplicate in file" : ""].filter(Boolean).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
