"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  BookOpen,
  FileText,
  UploadCloud,
  Trash2,
  CheckCircle2,
  Loader2,
  Link2,
  Layers,
  Sparkles,
  ChevronDown,
  HelpCircle,
  RefreshCw,
} from "lucide-react";
import type { KnowledgeDoc } from "@prisma/client";
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
import { readFaqState } from "@/lib/knowledgeFaq";
import { cn, formatDate } from "@/lib/utils";


/**
 * Indexing status, as the upload route and the worker record it on `metadata`.
 *
 * Kept in the existing Json column rather than added to the schema. A document is PROCESSING from
 * the moment it is stored until the worker finishes, so the list has something true to show while
 * the queue works instead of implying the upload is still running.
 */
type DocStatus = "PROCESSING" | "INDEXED" | "FAILED";

function readStatus(doc: KnowledgeDoc): { status: DocStatus; error?: string } {
  const meta = doc.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const raw = (meta as Record<string, unknown>).status;
    if (raw === "PROCESSING" || raw === "INDEXED" || raw === "FAILED") {
      const error = (meta as Record<string, unknown>).error;
      return { status: raw, error: typeof error === "string" ? error : undefined };
    }
  }
  // Documents uploaded before status tracking existed carry no marker; fall back to the flag.
  return { status: doc.isIndexed ? "INDEXED" : "PROCESSING" };
}

function useKnowledgeDocs() {
  return useQuery<KnowledgeDoc[]>({
    queryKey: ["knowledge"],
    queryFn: async () => {
      const res = await fetch("/api/knowledge");
      if (!res.ok) throw new Error(`Failed to load documents (${res.status})`);
      const json = await res.json();
      return Array.isArray(json) ? json : (json.data ?? []);
    },
    retry: false,
    // Indexing happens in a worker, so the row changes without the user doing anything. Polled
    // only while something is actually in flight — once every document has settled the interval
    // stops, so an idle knowledge base costs no requests.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((d) => readStatus(d).status === "PROCESSING") ? 3000 : false,
  });
}

/** `metadata` is free-form JSON on the model; the size may or may not be there. */
function readSize(doc: KnowledgeDoc): string {
  const meta = doc.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const raw = (meta as Record<string, unknown>).size;
    if (typeof raw === "number") {
      if (raw < 1024) return `${raw} B`;
      if (raw < 1024 * 1024) return `${(raw / 1024).toFixed(0)} KB`;
      return `${(raw / (1024 * 1024)).toFixed(1)} MB`;
    }
    if (typeof raw === "string") return raw;
  }
  return "—";
}

/**
 * The FAQs generated from one document, shown under that document.
 *
 * Read straight off `doc.metadata`, which the list already fetched — the ingest worker writes them
 * once when the document is indexed, so the common case costs no extra request and no model call.
 * The button is for what that leaves behind: documents indexed before FAQs existed, the occasional
 * generation that failed, and a set the user wants rewritten.
 */
function DocFaqs({ doc }: { doc: KnowledgeDoc }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { faqs, error, truncated } = readFaqState(doc.metadata);

  const generate = useMutation({
    mutationFn: async (force: boolean) => {
      const res = await fetch(`/api/knowledge/${doc.id}/faqs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Could not generate FAQs");
      return json;
    },
    onSuccess: () => {
      setOpen(true);
      queryClient.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });

  // Nothing to ask about until the document is actually in the index.
  if (!doc.isIndexed) return null;

  const failure = (generate.error as Error | null)?.message ?? error;

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      {faqs.length > 0 ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex w-full items-center justify-between gap-2 text-left text-xs font-medium text-slate-700 hover:text-emerald-700"
          >
            <span className="inline-flex items-center gap-1.5">
              <HelpCircle className="h-3.5 w-3.5 text-emerald-600" />
              {faqs.length} FAQ{faqs.length === 1 ? "" : "s"} from this document
            </span>
            <ChevronDown
              className={cn("h-3.5 w-3.5 shrink-0 text-slate-400 transition", open && "rotate-180")}
            />
          </button>

          {open && (
            <>
              {/* Said plainly, because six confident FAQs off a 200-page manual otherwise read
                  as the whole of what the document can answer. Retrieval still searches all of
                  it — only these questions are drawn from the opening sections. */}
              {truncated && (
                <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 ring-1 ring-inset ring-amber-600/20">
                  This document is long — these questions come from its opening sections. The AI
                  still searches the whole document when answering.
                </p>
              )}
              <ul className="mt-2 space-y-2">
                {faqs.map((faq, i) => (
                  <li key={i} className="rounded-lg bg-slate-50 px-2.5 py-2">
                    <p className="text-xs font-medium text-slate-800">{faq.question}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{faq.answer}</p>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={generate.isPending}
                onClick={() => generate.mutate(true)}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-emerald-700 disabled:opacity-50"
              >
                <RefreshCw className={cn("h-3 w-3", generate.isPending && "animate-spin")} />
                {generate.isPending ? "Regenerating…" : "Regenerate"}
              </button>
            </>
          )}
        </>
      ) : (
        <button
          type="button"
          disabled={generate.isPending}
          onClick={() => generate.mutate(false)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
        >
          {generate.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <HelpCircle className="h-3.5 w-3.5" />
          )}
          {generate.isPending ? "Reading the document…" : "Generate FAQs"}
        </button>
      )}

      {failure && !generate.isPending && (
        <p className="mt-1.5 text-xs text-rose-600">{failure}</p>
      )}
    </div>
  );
}

export default function KnowledgeBasePage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useKnowledgeDocs();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<KnowledgeDoc | null>(null);
  const docs = data ?? [];

  const indexed = docs.filter((d) => d.isIndexed).length;
  const chunks = docs.reduce((sum, d) => sum + (d.chunkCount ?? 0), 0);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? "Delete failed");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge"] });
      setConfirmDelete(null);
    },
  });

  return (
    <div>
      <PageHeader
        title="Knowledge Base"
        description="Documents the AI reads before answering a customer."
        action={
          <Button onClick={() => setOpen(true)}>
            <UploadCloud className="h-4 w-4" />
            Upload Document
          </Button>
        }
      />

      {docs.length > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-600/20">
          <Sparkles className="h-4 w-4 shrink-0" />
          <span>
            The AI is trained on <strong>{indexed}</strong> document{indexed === 1 ? "" : "s"} and{" "}
            <strong>{chunks}</strong> chunk{chunks === 1 ? "" : "s"}.
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="mt-3 h-4 w-3/4" />
              <Skeleton className="mt-2 h-3 w-1/2" />
              <Skeleton className="mt-4 h-3 w-full" />
            </Card>
          ))}
        </div>
      ) : isError || docs.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title={isError ? "The knowledge base isn't available yet" : "No documents yet"}
            description={
              isError
                ? "The knowledge API is still being built. Once it's live, your uploaded PDFs, docs and pages will be listed here with their indexing status."
                : "Upload a PDF, DOCX or TXT — or point us at a URL — and the AI will use it to answer customer questions."
            }
            action={
              <Button onClick={() => setOpen(true)}>
                <UploadCloud className="h-4 w-4" />
                Upload Document
              </Button>
            }
          />
        </Card>
      ) : (
        // items-start so expanding one document's FAQs grows that card only, instead of
        // stretching every other card in the row to match it.
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map((doc) => {
            const isDeleting = deleteMutation.isPending && deleteMutation.variables === doc.id;
            return (
              <Card key={doc.id} className="group flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <FileText className="h-5 w-5" />
                  </span>
                  <button
                    aria-label={`Delete ${doc.name}`}
                    disabled={isDeleting}
                    className="rounded-lg p-1.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600 group-hover:text-slate-400 disabled:opacity-50"
                    onClick={() => setConfirmDelete(doc)}
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>

                <p className="mt-3 truncate font-medium text-slate-900" title={doc.name}>
                  {doc.name}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge className="uppercase">{doc.type}</Badge>
                  <Badge className="bg-slate-50 text-slate-600">
                    <Layers className="mr-1 h-3 w-3" />
                    {doc.chunkCount} chunks
                  </Badge>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                  {(() => {
                    const { status, error } = readStatus(doc);
                    if (status === "INDEXED")
                      return (
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Indexed
                        </span>
                      );
                    if (status === "FAILED")
                      return (
                        <span
                          className="inline-flex items-center gap-1 font-medium text-rose-700"
                          title={error ?? "Indexing failed"}
                        >
                          <AlertCircle className="h-3.5 w-3.5" />
                          Failed
                        </span>
                      );
                    return (
                      <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Indexing…
                      </span>
                    );
                  })()}
                  <span className="text-slate-400">{readSize(doc)}</span>
                </div>
                <p className="mt-1.5 text-xs text-slate-400">Uploaded {formatDate(doc.createdAt)}</p>

                <DocFaqs doc={doc} />
              </Card>
            );
          })}
        </div>
      )}

      <UploadModal open={open} onClose={() => setOpen(false)} />

      {/* Delete confirmation modal */}
      <Modal
        open={!!confirmDelete}
        onClose={() => { if (!deleteMutation.isPending) setConfirmDelete(null); }}
        title="Delete document?"
        description={confirmDelete ? `"${confirmDelete.name}" will be removed from the knowledge base and the AI will no longer have access to it.` : ""}
      >
        {deleteMutation.isError && (
          <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {(deleteMutation.error as Error).message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => setConfirmDelete(null)}
            disabled={deleteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={deleteMutation.isPending}
            onClick={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
          >
            {deleteMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Deleting…</>
            ) : (
              "Delete document"
            )}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function UploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [url, setUrl] = useState("");
  const [urls, setUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setFiles([]);
    setUrl("");
    setUrls([]);
    setDragging(false);
    setError(null);
    onClose();
  };

  const upload = useMutation({
    // Files go up as multipart (real bytes, extracted server-side); a URL goes up as JSON.
    mutationFn: async (payload: FormData | { name: string; type: string; url: string }) => {
      const res = await fetch(
        "/api/knowledge",
        payload instanceof FormData
          ? { method: "POST", body: payload }
          : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      return json;
    },
    onError: (err: Error) => setError(err.message),
  });

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Upload Document"
      description="PDF, DOCX, images or TXT up to 10 MB — tables and scanned files supported. Or index a public web page."
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            if (files.length > 0) {
              const fd = new FormData();
              for (const file of files) fd.append("files", file);
              await upload.mutateAsync(fd);
            }
            const allUrls = [...urls, ...(url.trim() ? [url.trim()] : [])];
            for (const u of allUrls) {
              const name = u.split("/").filter(Boolean).pop() ?? "Web page";
              await upload.mutateAsync({ name, type: "URL", url: u });
            }
            queryClient.invalidateQueries({ queryKey: ["knowledge"] });
            close();
          } catch {
            // error handled by onError
          }
        }}
      >
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition",
            dragging
              ? "border-emerald-500 bg-emerald-50"
              : "border-slate-300 bg-slate-50/60 hover:border-emerald-400 hover:bg-emerald-50/40",
          )}
        >
          <UploadCloud
            className={cn("h-8 w-8", dragging ? "text-emerald-600" : "text-slate-400")}
          />
          <p className="mt-2 text-sm font-medium text-slate-800">
            Drag files here or click to browse
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Accepts PDF, DOCX, images (PNG/JPG), TXT or a URL</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.tiff,.bmp"
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
        </div>

        {files.length > 0 && (
          <ul className="space-y-1.5">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate text-slate-700">{f.name}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {urls.length > 0 && (
          <ul className="space-y-1.5">
            {urls.map((u, i) => (
              <li
                key={`${u}-${i}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Link2 className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate text-slate-700">{u}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${u}`}
                  onClick={() => setUrls((prev) => prev.filter((_, idx) => idx !== i))}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="relative">
          <div className="absolute inset-0 flex items-center" aria-hidden>
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-2 text-xs uppercase tracking-wide text-slate-400">or</span>
          </div>
        </div>

        <Field label="Add from URL" htmlFor="kb-url">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="kb-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className={cn(inputClass, "pl-9")}
                placeholder="https://yoursite.com/faq"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={!url.trim()}
              onClick={() => { setUrls((prev) => [...prev, url.trim()]); setUrl(""); }}
            >
              Add
            </Button>
          </div>
        </Field>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={(files.length === 0 && urls.length === 0 && !url.trim()) || upload.isPending}>
            {upload.isPending ? "Uploading…" : "Upload & Index"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
