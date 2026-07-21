"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Button, Modal, selectClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { parseCsv } from "@/lib/csv";

type Field = "name" | "phone" | "email" | "company" | "tags";

const FIELDS: { key: Field; label: string; required?: boolean }[] = [
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone", required: true },
  { key: "email", label: "Email" },
  { key: "company", label: "Company" },
  { key: "tags", label: "Tags" },
];

interface ImportReport {
  total: number;
  created: number;
  duplicates: number;
  failed: { row: number; phone: string; reason: string }[];
}

/** Best-effort auto-mapping of a CSV header to one of our fields. */
function autoMap(headers: string[]): Record<Field, string> {
  const find = (...needles: string[]) =>
    headers.find((h) => needles.some((n) => h.toLowerCase().includes(n))) ?? "";
  return {
    name: find("name"),
    phone: find("phone", "mobile", "number", "whatsapp"),
    email: find("email", "mail"),
    company: find("company", "organisation", "organization"),
    tags: find("tag", "label"),
  };
}

export function ImportContactsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<Field, string>>({
    name: "",
    phone: "",
    email: "",
    company: "",
    tags: "",
  });
  const [parseError, setParseError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  const reset = () => {
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({ name: "", phone: "", email: "", company: "", tags: "" });
    setParseError(null);
    setReport(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const onFile = async (file: File) => {
    setParseError(null);
    setReport(null);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (!parsed.headers.length || !parsed.rows.length) {
        setParseError("That file has no readable rows.");
        return;
      }
      setFileName(file.name);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(autoMap(parsed.headers));
    } catch {
      setParseError("Could not read that file. Make sure it's a valid CSV.");
    }
  };

  // Rows projected onto our fields, plus how many carry a phone (the only required column).
  const mapped = useMemo(() => {
    if (!mapping.phone) return { list: [], withPhone: 0 };
    const list = rows.map((r) => ({
      name: mapping.name ? r[mapping.name] : "",
      phone: mapping.phone ? r[mapping.phone] : "",
      email: mapping.email ? r[mapping.email] : "",
      company: mapping.company ? r[mapping.company] : "",
      tags: mapping.tags ? r[mapping.tags] : "",
    }));
    return { list, withPhone: list.filter((r) => r.phone?.trim()).length };
  }, [rows, mapping]);

  const importMutation = useMutation({
    mutationFn: async () => {
      const payload = mapped.list.filter((r) => r.phone?.trim());
      const res = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error((json as { error?: string }).error ?? "Import failed");
      }
      return json.data as ImportReport;
    },
    onSuccess: (data) => {
      setReport(data);
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });

  return (
    <Modal
      open={open}
      onClose={close}
      title="Import contacts"
      description="Upload a CSV with columns like Name, Phone, Email, Company and Tags."
      className="max-w-2xl"
    >
      {/* Step 3 — result report */}
      {report ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-inset ring-emerald-600/20">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <p className="text-sm text-emerald-800">
              Imported <strong>{report.created}</strong> contact
              {report.created === 1 ? "" : "s"}
              {report.duplicates > 0 && `, skipped ${report.duplicates} duplicate${report.duplicates === 1 ? "" : "s"}`}
              {report.failed.length > 0 && `, ${report.failed.length} could not be imported`}.
            </p>
          </div>

          {report.failed.length > 0 && (
            <div className="max-h-48 overflow-auto rounded-lg ring-1 ring-inset ring-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Row</th>
                    <th className="px-3 py-2 font-medium">Phone</th>
                    <th className="px-3 py-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.failed.slice(0, 100).map((f) => (
                    <tr key={f.row}>
                      <td className="px-3 py-1.5 text-slate-500">{f.row}</td>
                      <td className="px-3 py-1.5 font-mono text-slate-700">{f.phone || "—"}</td>
                      <td className="px-3 py-1.5 text-rose-600">{f.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={reset}>
              Import another
            </Button>
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      ) : rows.length === 0 ? (
        /* Step 1 — pick a file */
        <div>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-slate-500 transition hover:border-emerald-400 hover:bg-emerald-50/40 hover:text-emerald-600"
          >
            <UploadCloud className="h-8 w-8" />
            <span className="text-sm font-medium">Click to choose a CSV file</span>
            <span className="text-xs text-slate-400">Up to 5,000 rows</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
          {parseError && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{parseError}</p>
          )}
        </div>
      ) : (
        /* Step 2 — map columns and preview */
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <FileText className="h-4 w-4 text-slate-400" />
            <span className="font-medium text-slate-800">{fileName}</span>
            <span className="text-slate-400">· {rows.length} rows</span>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Match your columns</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <label key={f.key} className="text-xs">
                  <span className="mb-1 block font-medium text-slate-600">
                    {f.label}
                    {f.required && <span className="ml-0.5 text-rose-500">*</span>}
                  </span>
                  <select
                    value={mapping[f.key]}
                    onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                    className={cn(selectClass, "text-sm")}
                  >
                    <option value="">— Not mapped —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>

          {!mapping.phone ? (
            <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Map the <strong>Phone</strong> column to continue — it&apos;s required.
            </p>
          ) : (
            <div className="rounded-lg ring-1 ring-inset ring-slate-200">
              <div className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500">
                Preview — {mapped.withPhone} of {rows.length} rows have a phone and will be imported.
              </div>
              <div className="max-h-40 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">Name</th>
                      <th className="px-3 py-1.5 font-medium">Phone</th>
                      <th className="px-3 py-1.5 font-medium">Email</th>
                      <th className="px-3 py-1.5 font-medium">Company</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {mapped.list.slice(0, 6).map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 text-slate-700">{r.name || "—"}</td>
                        <td className="px-3 py-1.5 font-mono text-slate-700">{r.phone || "—"}</td>
                        <td className="px-3 py-1.5 text-slate-500">{r.email || "—"}</td>
                        <td className="px-3 py-1.5 text-slate-500">{r.company || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {importMutation.isError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {(importMutation.error as Error).message}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={reset} disabled={importMutation.isPending}>
              Choose a different file
            </Button>
            <Button
              onClick={() => importMutation.mutate()}
              disabled={!mapping.phone || mapped.withPhone === 0 || importMutation.isPending}
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing…
                </>
              ) : (
                `Import ${mapped.withPhone} contact${mapped.withPhone === 1 ? "" : "s"}`
              )}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
