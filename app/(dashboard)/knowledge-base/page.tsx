"use client";

/**
 * The documents the AI reads. Nothing else.
 *
 * FAQ editing used to expand inside these cards, which is what made it feel
 * cramped: a card in a three-column grid is about 380px wide, and an editor
 * needs room for a multi-line question, a paragraph of answer, and controls that
 * do not sit on top of either. Expanding one card also grew it past its
 * neighbours and shoved the rest of the page down.
 *
 * So the card went back to being a summary — what this file is, whether it is
 * indexed, how many questions it has — and the FAQ count became a link to
 * /knowledge-base/faqs, which has the whole width to work with.
 */

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  FileText,
  HelpCircle,
  Layers,
  Loader2,
  MessagesSquare,
  Sparkles,
  Pencil,
  Trash2,
  UploadCloud,
} from "lucide-react";
import type { KnowledgeDoc } from "@prisma/client";
import { Badge, Button, Card, EmptyState, Field, inputClass, Modal, PageHeader, Skeleton } from "@/components/ui";
import { readFaqState } from "@/lib/knowledgeFaq";
import { UploadModal } from "@/components/knowledge/UploadModal";
import { RetrievalTester } from "@/components/knowledge/RetrievalTester";
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

export default function KnowledgeBasePage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useKnowledgeDocs();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<KnowledgeDoc | null>(null);
  // Renaming changes the label this page and the FAQ picker show. The file's
  // content, chunks and vectors are products of the ingest pipeline and are not
  // editable — replacing a document means uploading it again.
  const [renameDoc, setRenameDoc] = useState<KnowledgeDoc | null>(null);
  const [draftName, setDraftName] = useState("");
  const docs = data ?? [];

  const indexed = docs.filter((d) => d.isIndexed).length;
  const chunks = docs.reduce((sum, d) => sum + (d.chunkCount ?? 0), 0);
  const faqs = docs.reduce((sum, d) => sum + readFaqState(d.metadata).faqs.length, 0);

  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await fetch(`/api/knowledge/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Rename failed");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge"] });
      setRenameDoc(null);
    },
  });

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
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setOpen(true)}>
              <UploadCloud className="h-4 w-4" />
              Upload
            </Button>
            <Link href="/knowledge-base/faqs">
              <Button>
                <MessagesSquare className="h-4 w-4" />
                FAQs
              </Button>
            </Link>
          </div>
        }
      />

      {docs.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-600/20">
          <span className="inline-flex items-center gap-2 font-medium">
            <Sparkles className="h-4 w-4 shrink-0" />
            The AI is trained on <strong>{indexed}</strong> document{indexed === 1 ? "" : "s"}
          </span>
          <span className="text-emerald-800/80">{chunks} searchable chunks</span>
          {/* Third number on the same line because it belongs to the same
              question — how much does the AI actually know — and because it is
              the only pointer from here to the FAQ screen. */}
          <Link
            href="/knowledge-base/faqs"
            className="ml-auto inline-flex items-center gap-1.5 font-medium text-emerald-800 underline-offset-2 hover:underline"
          >
            <HelpCircle className="h-4 w-4" />
            {faqs} FAQ{faqs === 1 ? "" : "s"} written
          </Link>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <Skeleton className="mt-4 h-4 w-3/4" />
              <Skeleton className="mt-2 h-3 w-1/2" />
              <Skeleton className="mt-5 h-3 w-full" />
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
        // Equal-height cards again, now that nothing expands in place. items-start
        // was only ever there to stop an opened FAQ list stretching its whole row.
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              deleting={deleteMutation.isPending && deleteMutation.variables === doc.id}
              onDelete={() => setConfirmDelete(doc)}
              onRename={() => {
                setDraftName(doc.name);
                setRenameDoc(doc);
              }}
            />
          ))}
        </div>
      )}

      {!isLoading && !isError && docs.length > 0 && <RetrievalTester />}

      <UploadModal open={open} onClose={() => setOpen(false)} />

      <Modal
        open={!!renameDoc}
        onClose={() => {
          if (!renameMutation.isPending) setRenameDoc(null);
        }}
        title="Rename document"
        description="This changes the name shown here and in the FAQ picker. The document's content and its search index are unchanged."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const name = draftName.trim();
            if (renameDoc && name) renameMutation.mutate({ id: renameDoc.id, name });
          }}
        >
          <Field label="Document name">
            <input
              className={inputClass}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={200}
              autoFocus
            />
          </Field>
          {renameMutation.isError && (
            <p role="alert" className="mt-2 text-sm text-rose-600">
              {(renameMutation.error as Error).message}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRenameDoc(null)}
              disabled={renameMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={renameMutation.isPending || !draftName.trim()}>
              {renameMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Modal>

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

// ─── Card ─────────────────────────────────────────────────────────────────────

function DocumentCard({
  doc,
  deleting,
  onDelete,
  onRename,
}: {
  doc: KnowledgeDoc;
  deleting: boolean;
  onDelete: () => void;
  onRename: () => void;
}) {
  const { status, error } = readStatus(doc);
  const faqCount = readFaqState(doc.metadata).faqs.length;

  return (
    <Card className="group flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          <FileText className="h-5 w-5" />
        </span>
        <div className="flex items-center gap-1">
          <button
            aria-label={`Rename ${doc.name}`}
            className="rounded-lg p-1.5 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600 group-hover:text-slate-400"
            onClick={onRename}
          >
            <Pencil className="h-4 w-4" />
          </button>
        <button
          aria-label={`Delete ${doc.name}`}
          disabled={deleting}
          className="rounded-lg p-1.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600 group-hover:text-slate-400 disabled:opacity-50"
          onClick={onDelete}
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
        </div>
      </div>

      {/* Two lines rather than one truncated one. Uploaded filenames are long and
          near-identical at the front — "AI-Powered WhatsApp CRM, Automation…"
          told you nothing about which of two files this was. */}
      <p className="mt-4 line-clamp-2 font-medium leading-snug text-slate-900" title={doc.name}>
        {doc.name}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge className="uppercase">{doc.type}</Badge>
        <Badge className="bg-slate-50 text-slate-600">
          <Layers className="mr-1 h-3 w-3" />
          {doc.chunkCount} chunks
        </Badge>
      </div>

      {/* mt-auto pins the status block to the bottom, so every card in a row
          lines its footer up regardless of how long the filename wrapped. */}
      <div className="mt-auto pt-5">
        <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
          {status === "INDEXED" ? (
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Indexed
            </span>
          ) : status === "FAILED" ? (
            <span
              className="inline-flex items-center gap-1 font-medium text-rose-700"
              title={error ?? "Indexing failed"}
            >
              <AlertCircle className="h-3.5 w-3.5" />
              Failed
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

        {/* A link, not an expander. The editor needs the full width of a page;
            see the note at the top of this file. */}
        {status === "INDEXED" && (
          <Link
            href={`/knowledge-base/faqs?doc=${doc.id}`}
            className={cn(
              "mt-3 flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition",
              faqCount > 0
                ? "bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100"
                : "text-slate-500 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-slate-800",
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              <HelpCircle className="h-3.5 w-3.5" />
              {faqCount > 0 ? `${faqCount} FAQ${faqCount === 1 ? "" : "s"}` : "Add FAQs"}
            </span>
            <span aria-hidden>→</span>
          </Link>
        )}
      </div>
    </Card>
  );
}
