"use client";

/**
 * Every FAQ list in the workspace, on one page.
 *
 * WHY THIS IS NOT ON THE DOCUMENT CARDS
 *
 * It used to be: each card expanded to reveal its own editor. A card in a
 * three-column grid is about 380px wide, and an editor needs room for a
 * multi-line question, a paragraph of answer and two controls that must not
 * overlap either. Everything was cramped because the container was wrong, and no
 * amount of padding fixes a column that narrow. Expanding one card also grew it
 * past its neighbours and pushed everything below it down the page.
 *
 * WHY BOTH KINDS LIVE IN ONE LIST
 *
 * "A document's FAQs" and "a set's FAQs" were being presented as two separate
 * features in two separate places, and they are not. Both are a list of
 * questions with a scope — one document, or several. Same editor, same actions,
 * same storage shape. So they share a list, and the only thing that differs is
 * what the scope line says.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  FileStack,
  FileText,
  Loader2,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type { KnowledgeDoc } from "@prisma/client";
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Skeleton } from "@/components/ui";
import { readFaqState, type DocFaq, type FaqStyle } from "@/lib/knowledgeFaq";
import { cn } from "@/lib/utils";
import { FaqEditor } from "@/components/knowledge/FaqEditor";
import { CreateSetModal } from "@/components/knowledge/CreateSetModal";
import { SETS_KEY, useFaqSets, type FaqSet } from "@/components/knowledge/faqSets";
import { postJson } from "@/components/knowledge/api";
import { ExportButton } from "@/components/ExportButton";
import { FaqInterest } from "@/components/knowledge/FaqInterest";

/**
 * A document's FAQs and a set's FAQs, reduced to the one shape the page renders.
 *
 * The differences that survive are the two that matter to a reader: what the
 * questions are drawn from, and whether the thing can be deleted. Everything
 * else — how it loads, how it saves, how a row is answered — is behind the three
 * closures, so the list and the editor never branch on which kind this is.
 */
interface Collection {
  key: string;
  kind: "document" | "set";
  id: string;
  title: string;
  /** Document names this list draws on. */
  sources: string[];
  faqs: DocFaq[];
  style: FaqStyle;
  seedKey: string;
  truncated: boolean;
  error: string | null;
  /** Set only: ids whose document has since been deleted. */
  missingDocs: number;
}

function documentCollection(doc: KnowledgeDoc): Collection {
  const { faqs, error, truncated, style } = readFaqState(doc.metadata);
  return {
    key: `doc:${doc.id}`,
    kind: "document",
    id: doc.id,
    title: doc.name,
    sources: [doc.name],
    faqs,
    style,
    seedKey: String(doc.updatedAt),
    truncated: Boolean(truncated),
    error: error ?? null,
    missingDocs: 0,
  };
}

function setCollection(set: FaqSet): Collection {
  return {
    key: `set:${set.id}`,
    kind: "set",
    id: set.id,
    title: set.name,
    sources: set.documents.map((d) => d.name),
    faqs: set.faqs,
    style: set.style,
    seedKey: set.updatedAt,
    truncated: set.truncated,
    error: set.error,
    missingDocs: set.missingDocs,
  };
}

/**
 * The three FAQ operations, per kind.
 *
 * The only place the page branches on document-versus-set. Both storage layers
 * expose the same three verbs — propose questions, answer one, save the list —
 * they just live at different URLs, so the difference is confined to this
 * function and the editor above it never learns about it.
 */
function collectionOps(collection: Collection, onWrite: () => void) {
  const base =
    collection.kind === "document"
      ? `/api/knowledge/${collection.id}`
      : `/api/knowledge/faq-sets/${collection.id}`;

  return {
    proposeQuestions: async (existing: string[], count: number, style: FaqStyle) => {
      const json =
        collection.kind === "document"
          ? await postJson<{ questions: string[] }>(`${base}/faqs`, {
              mode: "questions",
              existing,
              count,
              style,
            })
          : await postJson<{ questions: string[] }>(`${base}/questions`, { existing, count, style });
      return json.data?.questions ?? [];
    },

    answerQuestion: async (index: number, faqs: DocFaq[], style: FaqStyle) => {
      const url = collection.kind === "document" ? `${base}/faqs/answer` : `${base}/answer`;
      const json = await postJson<{ item: DocFaq }>(url, { index, faqs, style });
      if (!json.data) throw new Error("The server did not return an answer.");
      onWrite();
      return json.data.item;
    },

    save: async (faqs: DocFaq[], style: FaqStyle) => {
      const url = collection.kind === "document" ? `${base}/faqs` : base;
      await postJson(url, { faqs, style }, "PUT");
      onWrite();
    },
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function FaqWorkbench() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();

  const { data: docs = [], isLoading: docsLoading } = useQuery<KnowledgeDoc[]>({
    queryKey: ["knowledge"],
    queryFn: async () => {
      const res = await fetch("/api/knowledge");
      if (!res.ok) throw new Error(`Failed to load documents (${res.status})`);
      const json = await res.json();
      return Array.isArray(json) ? json : (json.data ?? []);
    },
    retry: false,
  });
  const { data: sets = [], isLoading: setsLoading } = useFaqSets();

  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Collection | null>(null);

  const indexed = useMemo(() => docs.filter((d) => d.isIndexed), [docs]);
  const collections = useMemo(
    () => [...indexed.map(documentCollection), ...sets.map(setCollection)],
    [indexed, sets],
  );

  // Selection lives in the URL so a document card can link straight to its list
  // and a reload keeps you where you were.
  const selectedKey =
    (params.get("set") && `set:${params.get("set")}`) ||
    (params.get("doc") && `doc:${params.get("doc")}`) ||
    collections[0]?.key;

  const selected = collections.find((c) => c.key === selectedKey) ?? collections[0] ?? null;

  const select = (collection: Collection) => {
    const query = collection.kind === "document" ? `doc=${collection.id}` : `set=${collection.id}`;
    router.replace(`/knowledge-base/faqs?${query}`, { scroll: false });
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["knowledge"] });
    queryClient.invalidateQueries({ queryKey: SETS_KEY });
  };

  const removeSet = useMutation({
    mutationFn: (id: string) => postJson(`/api/knowledge/faq-sets/${id}`, {}, "DELETE"),
    onSuccess: () => {
      invalidate();
      setConfirmDelete(null);
      router.replace("/knowledge-base/faqs", { scroll: false });
    },
  });

  const loading = docsLoading || setsLoading;

  return (
    <div>
      <Link
        href="/knowledge-base"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Knowledge Base
      </Link>

      <PageHeader
        title="FAQs"
        description="The questions your AI can answer, and the answers it will give."
        action={
          <div className="flex items-center gap-2">
            {/* Where the questions live is where you want to know which ones
                customers actually tapped. */}
            <ExportButton resource="faq-interest" label="Export interest" />
            <Button variant="secondary" onClick={() => setCreating(true)} disabled={indexed.length < 2}>
              <Plus className="h-4 w-4" />
              New combined set
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      ) : collections.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title="Nothing to write FAQs from yet"
            description="Upload a document first. Once it is indexed, its FAQs appear here — and you can combine several documents into one set."
            action={
              <Button onClick={() => router.push("/knowledge-base")}>Go to Knowledge Base</Button>
            }
          />
        </Card>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[18rem_1fr]">
          <CollectionList
            collections={collections}
            selectedKey={selected?.key}
            onSelect={select}
            onNewSet={() => setCreating(true)}
            canCombine={indexed.length >= 2}
          />

          {selected && (
            <CollectionEditor
              collection={selected}
              onWrite={invalidate}
              onDelete={selected.kind === "set" ? () => setConfirmDelete(selected) : undefined}
            />
          )}
        </div>
      )}

      {/* Below the editor, not beside it: what customers asked only means
          something once you can see the questions you offered them. */}
      {collections.length > 0 && <FaqInterest />}

      <CreateSetModal
        open={creating}
        documents={indexed.map((d) => ({ id: d.id, name: d.name, isIndexed: d.isIndexed }))}
        onClose={() => setCreating(false)}
        onCreated={(set) => router.replace(`/knowledge-base/faqs?set=${set.id}`, { scroll: false })}
      />

      <Modal
        open={!!confirmDelete}
        onClose={() => { if (!removeSet.isPending) setConfirmDelete(null); }}
        title="Delete this set?"
        description={
          confirmDelete
            ? `"${confirmDelete.title}" and its questions will be removed. The documents themselves are not touched.`
            : ""
        }
      >
        {removeSet.isError && (
          <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {(removeSet.error as Error).message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDelete(null)} disabled={removeSet.isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={removeSet.isPending}
            onClick={() => confirmDelete && removeSet.mutate(confirmDelete.id)}
          >
            {removeSet.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Deleting…</>
            ) : (
              "Delete set"
            )}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// ─── Left rail ────────────────────────────────────────────────────────────────

function CollectionList({
  collections,
  selectedKey,
  onSelect,
  onNewSet,
  canCombine,
}: {
  collections: Collection[];
  selectedKey?: string;
  onSelect: (collection: Collection) => void;
  onNewSet: () => void;
  canCombine: boolean;
}) {
  const documents = collections.filter((c) => c.kind === "document");
  const sets = collections.filter((c) => c.kind === "set");

  return (
    <Card className="overflow-hidden p-0 lg:sticky lg:top-6">
      <Section title="Documents" icon={FileText} count={documents.length}>
        {documents.map((c) => (
          <CollectionRow
            key={c.key}
            collection={c}
            active={c.key === selectedKey}
            onSelect={() => onSelect(c)}
          />
        ))}
      </Section>

      <Section title="Combined sets" icon={FileStack} count={sets.length}>
        {sets.map((c) => (
          <CollectionRow
            key={c.key}
            collection={c}
            active={c.key === selectedKey}
            onSelect={() => onSelect(c)}
          />
        ))}
        {sets.length === 0 && (
          <p className="px-4 pb-3 text-xs leading-relaxed text-slate-500">
            {canCombine
              ? "Questions whose answer spans more than one document."
              : "Upload a second document to combine them."}
          </p>
        )}
        {canCombine && (
          <button
            type="button"
            onClick={onNewSet}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
          >
            <Plus className="h-4 w-4" />
            New set
          </button>
        )}
      </Section>
    </Card>
  );
}

function Section({
  title,
  icon: Icon,
  count,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <p className="flex items-center gap-2 px-4 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <Icon className="h-3.5 w-3.5" />
        {title}
        <span className="ml-auto font-mono text-slate-300">{count}</span>
      </p>
      {children}
    </div>
  );
}

function CollectionRow({
  collection,
  active,
  onSelect,
}: {
  collection: Collection;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-2 border-l-2 px-4 py-2.5 text-left transition",
        active
          ? "border-[#0B6E4F] bg-emerald-50/70"
          : "border-transparent hover:border-slate-200 hover:bg-slate-50",
      )}
    >
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-sm",
            active ? "font-semibold text-slate-900" : "text-slate-700",
          )}
          title={collection.title}
        >
          {collection.title}
        </span>
        {collection.kind === "set" && (
          <span className="mt-0.5 block truncate text-xs text-slate-400">
            {collection.sources.length} document{collection.sources.length === 1 ? "" : "s"}
          </span>
        )}
      </span>

      {/* The count is the whole reason to scan this list — which of these has
          questions and which is still empty. */}
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
          collection.faqs.length > 0 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-400",
        )}
      >
        {collection.faqs.length}
      </span>
    </button>
  );
}

// ─── Right pane ───────────────────────────────────────────────────────────────

function CollectionEditor({
  collection,
  onWrite,
  onDelete,
}: {
  collection: Collection;
  onWrite: () => void;
  onDelete?: () => void;
}) {
  const ops = collectionOps(collection, onWrite);

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-slate-900" title={collection.title}>
            {collection.title}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {collection.kind === "document" ? (
              <span className="text-sm text-slate-500">
                Answered from this document only.
              </span>
            ) : (
              <>
                <span className="text-sm text-slate-500">Answered from</span>
                {collection.sources.map((name) => (
                  <Badge key={name} className="bg-slate-50 text-slate-600">
                    {name}
                  </Badge>
                ))}
              </>
            )}
            {collection.missingDocs > 0 && (
              <Badge className="bg-amber-50 text-amber-800">
                <TriangleAlert className="mr-1 h-3 w-3" />
                {collection.missingDocs} deleted
              </Badge>
            )}
          </div>
        </div>

        {onDelete && (
          <button
            type="button"
            aria-label={`Delete ${collection.title}`}
            onClick={onDelete}
            className="shrink-0 rounded-lg p-2 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-5">
        <FaqEditor
          // Remounted per collection so the editor's local rows can never carry
          // over from the list that was open a moment ago.
          key={collection.key}
          faqs={collection.faqs}
          seedKey={collection.seedKey}
          sources={collection.sources}
          truncated={collection.truncated}
          storedError={collection.error}
          style={collection.style}
          disabled={collection.kind === "set" && collection.sources.length === 0}
          proposeQuestions={ops.proposeQuestions}
          answerQuestion={ops.answerQuestion}
          save={ops.save}
          emptyHint={
            collection.kind === "document"
              ? "No questions yet. Suggest a few from this document, or write your own."
              : "No questions yet. Suggest a few drawn from all of these documents, or write your own."
          }
        />
      </div>
    </Card>
  );
}
