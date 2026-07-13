"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  FileText,
  UploadCloud,
  Trash2,
  CheckCircle2,
  Loader2,
  Link2,
  Layers,
  Sparkles,
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
import { cn, formatDate } from "@/lib/utils";


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

export default function KnowledgeBasePage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useKnowledgeDocs();
  const [open, setOpen] = useState(false);
  const docs = data ?? [];

  const indexed = docs.filter((d) => d.isIndexed).length;
  const chunks = docs.reduce((sum, d) => sum + (d.chunkCount ?? 0), 0);

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map((doc) => (
            <Card key={doc.id} className="group flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <FileText className="h-5 w-5" />
                </span>
                <button
                  aria-label={`Delete ${doc.name}`}
                  className="rounded-lg p-1.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600 group-hover:text-slate-400"
                  onClick={async () => {
                    if (!confirm(`Delete "${doc.name}"?`)) return;
                    await fetch(`/api/knowledge/${doc.id}`, { method: "DELETE" });
                    queryClient.invalidateQueries({ queryKey: ["knowledge"] });
                  }}
                >
                  <Trash2 className="h-4 w-4" />
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
                {doc.isIndexed ? (
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Indexed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Indexing…
                  </span>
                )}
                <span className="text-slate-400">{readSize(doc)}</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-400">Uploaded {formatDate(doc.createdAt)}</p>
            </Card>
          ))}
        </div>
      )}

      <UploadModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function UploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setFiles([]);
    setUrl("");
    setDragging(false);
    setError(null);
    onClose();
  };

  const upload = useMutation({
    mutationFn: async ({ name, type, content, url: docUrl }: { name: string; type: string; content?: string; url?: string }) => {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, content, url: docUrl }),
      });
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
      description="PDF, DOCX or TXT up to 10 MB — or index a public web page."
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            if (url.trim()) {
              const name = url.split("/").filter(Boolean).pop() ?? "Web page";
              await upload.mutateAsync({ name, type: "URL", url: url.trim() });
            }
            for (const file of files) {
              const text = await file.text();
              const ext = (file.name.split(".").pop() ?? "TXT").toUpperCase();
              await upload.mutateAsync({ name: file.name, type: ext, content: text });
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
          <p className="mt-0.5 text-xs text-slate-500">Accepts PDF, DOCX, TXT or a URL</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt"
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
            <Button type="button" variant="secondary" disabled={!url.trim()}>
              Add
            </Button>
          </div>
        </Field>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={(files.length === 0 && !url.trim()) || upload.isPending}>
            {upload.isPending ? "Uploading…" : "Upload & Index"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
