"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Filter, Megaphone, Search, Upload, UserPlus } from "lucide-react";
import {
  useBulkContactAction,
  useContactSources,
  useContactTags,
  useContacts,
  type ContactBulkAction,
} from "@/hooks/useContacts";
import { ExportButton } from "@/components/ExportButton";
import { Button, Card, Modal, PageHeader, inputClass } from "@/components/ui";
import { AddContactModal } from "@/components/contacts/AddContactModal";
import { EditContactModal } from "@/components/contacts/EditContactModal";
import { ImportContactsModal } from "@/components/contacts/ImportContactsModal";
import {
  ContactTable,
  type ContactPermissions,
  type ContactRow,
  type RowAction,
} from "@/components/contacts/ContactTable";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

const PAGE_SIZE = 20;

type Status = "active" | "blocked" | "deleted";

const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: "active", label: "All contacts" },
  { value: "blocked", label: "Blocked numbers" },
  { value: "deleted", label: "Deleted contacts" },
];

/** An action waiting for the user to confirm (and, for some, type a reason or tag). */
interface PendingAction {
  action: ContactBulkAction;
  contacts: ContactRow[];
}

interface SegmentOption {
  id: string;
  name: string;
  count: number;
}

const ACTION_COPY: Record<"delete" | "block" | "addTag", { title: string; confirm: string }> = {
  delete: { title: "Delete", confirm: "Delete" },
  block: { title: "Block", confirm: "Block" },
  addTag: { title: "Add a tag to", confirm: "Add tag" },
};

const who = (contacts: ContactRow[]) =>
  contacts.length === 1 ? contacts[0].name || contacts[0].phone || "this contact" : `${contacts.length} contacts`;

export default function ContactsPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<Status>("active");
  const [tagId, setTagId] = useState("");
  const [source, setSource] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editContact, setEditContact] = useState<ContactRow | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [actionText, setActionText] = useState("");
  const bulk = useBulkContactAction();
  const { showToast } = useToast();

  // Debounce the search box so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Any filter change invalidates the current page and the current selection.
  // Done in the change handlers rather than an effect — resetting state from an
  // effect costs an extra render pass and trips react-hooks/set-state-in-effect.
  function resetPaging() {
    setPage(1);
    setSelected([]);
  }

  const { data, isLoading, isError } = useContacts({
    search: debounced || undefined,
    tagId: tagId || undefined,
    source: source || undefined,
    segmentId: segmentId || undefined,
    status,
    page,
    limit: PAGE_SIZE,
  });
  const { data: sourceOptions = [] } = useContactSources();
  const { data: tagOptions = [] } = useContactTags();
  // Segments need campaign access; without it the dropdown simply doesn't appear.
  const { data: segments = [] } = useQuery<SegmentOption[]>({
    queryKey: ["segments"],
    queryFn: async () => {
      const res = await fetch("/api/segments");
      if (!res.ok) return [];
      const json = await res.json().catch(() => ({}));
      return Array.isArray(json.data) ? json.data : [];
    },
  });

  const rows: ContactRow[] = useMemo(() => {
    const list = (data as { data?: unknown } | undefined)?.data;
    return Array.isArray(list) ? (list as ContactRow[]) : [];
  }, [data]);

  const permissions: ContactPermissions = (data as { permissions?: ContactPermissions } | undefined)
    ?.permissions ?? { delete: false, block: false, manage: false };

  const pagination = (data as { pagination?: { total?: number; limit?: number } } | undefined)
    ?.pagination;
  const pageSize = pagination?.limit ?? PAGE_SIZE;
  const total = pagination?.total ?? rows.length;

  const chosenSegment = segments.find((s) => s.id === segmentId) ?? null;
  const filtered = Boolean(debounced || tagId || source || segmentId || status !== "active");
  // Tag and source filters translate one-to-one into segment rules.
  const segmentDraftHref = (() => {
    const q = new URLSearchParams();
    if (tagId) q.set("tag", tagId);
    if (source) q.set("source", source);
    return `/segments?${q}`;
  })();

  const selectClass = cn(inputClass, "cursor-pointer bg-white sm:w-44");

  function run(action: ContactBulkAction, contacts: ContactRow[], extra?: { reason?: string; tag?: string }) {
    bulk.mutate(
      { action, ids: contacts.map((c) => c.id), ...extra },
      {
        onSuccess: (r) => {
          setPending(null);
          setActionText("");
          setSelected([]);
          const n = r.affected;
          const s = n === 1 ? "" : "s";
          const done: Record<ContactBulkAction, string> = {
            delete: `${n} contact${s} deleted. Find them under "Deleted contacts" to restore.`,
            restore: `${n} contact${s} restored.`,
            block: `${n} number${s} blocked. No message will be sent to ${n === 1 ? "it" : "them"}.`,
            unblock: `${n} number${s} unblocked.`,
            addTag: `Tag added to ${n} contact${s}.`,
            removeTag: `Tag removed from ${n} contact${s}.`,
          };
          let message = done[action];
          if (action === "block" && r.unchanged > 0) message += ` ${r.unchanged} were already blocked.`;
          if (r.platformBlocked) {
            message += ` ${r.platformBlocked} ${r.platformBlocked === 1 ? "is" : "are"} also blocked platform-wide; only the platform admin can lift that.`;
          }
          showToast(message, "success");
        },
        onError: (err) => {
          showToast(err.message, "error");
        },
      },
    );
  }

  function onAction(action: RowAction, contacts: ContactRow[]) {
    if (contacts.length === 0) return;
    if (action === "restore" || action === "unblock") {
      run(action, contacts);
      return;
    }
    setActionText("");
    setPending({ action, contacts });
  }

  const pendingCopy = pending && pending.action in ACTION_COPY ? ACTION_COPY[pending.action as keyof typeof ACTION_COPY] : null;

  return (
    <div>
      <PageHeader
        title="Contacts"
        description="Everyone who has ever messaged your WhatsApp business number."
        action={
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button variant="secondary" onClick={() => setImportOpen(true)} className="flex-1 sm:flex-none">
              <Upload className="h-4 w-4" />
              Import
            </Button>
            <ExportButton resource="contacts" />
            <Button onClick={() => setModalOpen(true)} className="flex-1 sm:flex-none">
              <UserPlus className="h-4 w-4" />
              Add Contact
            </Button>
          </div>
        }
      />

      {/* Filter bar */}
      <Card className="mb-4 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPaging();
              }}
              placeholder="Search by name or phone…"
              aria-label="Search contacts"
              className={cn(inputClass, "pl-9")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as Status);
                resetPaging();
              }}
              aria-label="Show"
              className={selectClass}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            {segments.length > 0 && (
              <select
                value={segmentId}
                onChange={(e) => {
                  setSegmentId(e.target.value);
                  resetPaging();
                }}
                aria-label="Filter by segment"
                className={selectClass}
              >
                <option value="">All segments</option>
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}

            <select
              value={tagId}
              onChange={(e) => {
                setTagId(e.target.value);
                resetPaging();
              }}
              aria-label="Filter by tag"
              className={selectClass}
            >
              <option value="">All tags</option>
              {tagOptions.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name} ({tag.count})
                </option>
              ))}
            </select>

            <select
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                resetPaging();
              }}
              aria-label="Filter by source"
              className={selectClass}
            >
              <option value="">All sources</option>
              {sourceOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filtered contacts → campaign. A segment is sent to directly; tag/source
            filters open the segment builder pre-filled so they can be saved and sent. */}
        {status === "active" && (chosenSegment || tagId || source) && (
          <div className="mt-3 flex flex-col gap-2 rounded-lg bg-emerald-50/70 px-3 py-2.5 text-sm ring-1 ring-inset ring-emerald-600/15 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-emerald-900">
              <Filter className="h-4 w-4 shrink-0" />
              {chosenSegment
                ? `${total.toLocaleString()} contact${total === 1 ? "" : "s"} in "${chosenSegment.name}"${tagId || source || debounced ? " match these filters" : ""}`
                : `${total.toLocaleString()} contact${total === 1 ? "" : "s"} match these filters`}
            </p>
            <div className="flex flex-wrap gap-2">
              {chosenSegment ? (
                <Link
                  href={`/campaigns?segment=${chosenSegment.id}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  <Megaphone className="h-3.5 w-3.5" />
                  Send campaign to segment
                </Link>
              ) : (
                <Link
                  href={segmentDraftHref}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  <Megaphone className="h-3.5 w-3.5" />
                  Save as segment &amp; send campaign
                </Link>
              )}
            </div>
          </div>
        )}
      </Card>

      <ContactTable
        contacts={rows}
        isLoading={isLoading}
        isError={isError}
        selected={selected}
        onSelectedChange={setSelected}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(next) => {
          setPage(next);
          setSelected([]);
        }}
        onAddContact={() => setModalOpen(true)}
        onEditContact={(contact) => setEditContact(contact)}
        onDeleteContact={(contact) => onAction("delete", [contact])}
        onAction={onAction}
        permissions={permissions}
        showingDeleted={status === "deleted"}
        emptyMessage={
          status === "blocked"
            ? { title: "No blocked numbers", description: "Contacts you block appear here. Blocked numbers never receive a message." }
            : status === "deleted"
              ? { title: "No deleted contacts", description: "Deleted contacts appear here and can be restored." }
              : filtered
                ? { title: "No matching contacts", description: "Try a different search or clear the filters." }
                : undefined
        }
      />

      <EditContactModal contact={editContact} onClose={() => setEditContact(null)} />

      {/* Delete, block and tag ask first; restore and unblock happen straight away. */}
      <Modal
        open={!!pending && !!pendingCopy}
        onClose={() => {
          if (!bulk.isPending) setPending(null);
        }}
        title={pending && pendingCopy ? `${pendingCopy.title} ${who(pending.contacts)}?` : ""}
        description={
          !pending
            ? ""
            : pending.action === "delete"
              ? `${who(pending.contacts)} will be removed from your contact list. Conversation history is kept, and you can restore ${pending.contacts.length === 1 ? "it" : "them"} from "Deleted contacts". Deleting does not stop messages — use Block for that.`
              : pending.action === "block"
                ? `No message will be sent to ${pending.contacts.length === 1 ? "this number" : "these numbers"} from this account: no campaigns, broadcasts, inbox replies or automated replies, until unblocked. The contacts are kept.`
                : "Type a tag name. A new tag is created if it doesn't exist yet."
        }
      >
        {pending?.action === "block" && (
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="contact-block-reason">
              Reason <span className="font-normal text-slate-400">(optional, kept in the history)</span>
            </label>
            <input
              id="contact-block-reason"
              value={actionText}
              onChange={(e) => setActionText(e.target.value)}
              maxLength={500}
              className={inputClass}
              placeholder="e.g. Asked not to be contacted"
            />
          </div>
        )}
        {pending?.action === "addTag" && (
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="contact-tag-name">
              Tag
            </label>
            <input
              id="contact-tag-name"
              list="contact-tag-options"
              value={actionText}
              onChange={(e) => setActionText(e.target.value)}
              maxLength={50}
              className={inputClass}
              placeholder="e.g. VIP"
              autoFocus
            />
            <datalist id="contact-tag-options">
              {tagOptions.map((t) => (
                <option key={t.id} value={t.name} />
              ))}
            </datalist>
          </div>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setPending(null)} disabled={bulk.isPending}>
            Cancel
          </Button>
          <Button
            variant={pending?.action === "addTag" ? "primary" : "danger"}
            disabled={bulk.isPending || (pending?.action === "addTag" && !actionText.trim())}
            onClick={() => {
              if (!pending) return;
              run(
                pending.action,
                pending.contacts,
                pending.action === "block"
                  ? { reason: actionText.trim() || undefined }
                  : pending.action === "addTag"
                    ? { tag: actionText.trim() }
                    : undefined,
              );
            }}
          >
            {bulk.isPending ? "Working…" : pendingCopy?.confirm}
          </Button>
        </div>
      </Modal>

      <AddContactModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <ImportContactsModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
