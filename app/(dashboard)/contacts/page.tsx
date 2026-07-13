"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { useContacts } from "@/hooks/useContacts";
import { Button, Card, PageHeader, inputClass } from "@/components/ui";
import { AddContactModal, CONTACT_SOURCES } from "@/components/contacts/AddContactModal";
import {
  ContactTable,
  contactTags,
  type ContactRow,
  type TagChip,
} from "@/components/contacts/ContactTable";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

export default function ContactsPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [tagId, setTagId] = useState("");
  const [source, setSource] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

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
    page,
  });

  // The API is a 501 stub, so treat every shape as optional.
  const rows: ContactRow[] = useMemo(() => {
    const list = (data as { data?: unknown } | undefined)?.data;
    return Array.isArray(list) ? (list as ContactRow[]) : [];
  }, [data]);

  // TODO [SHALMON]: GET /api/contacts has no `source` filter yet — filtering the
  // current page client-side until the query param exists.
  const contacts = useMemo(
    () =>
      source
        ? rows.filter((c) => (c.source ?? "").toLowerCase() === source.toLowerCase())
        : rows,
    [rows, source],
  );

  // TODO [SHALMON]: there is no tags endpoint, so the dropdown is built from the
  // tags present on the contacts the API returned. Filtering by a tag keeps that
  // tag in the list, because every returned contact carries it.
  const tagOptions: TagChip[] = useMemo(() => {
    const merged = new Map<string, TagChip>();
    for (const tag of rows.flatMap((c) => contactTags(c.tags))) {
      if (!merged.has(tag.id)) merged.set(tag.id, tag);
    }
    return [...merged.values()];
  }, [rows]);

  const pagination = (data as { pagination?: { total?: number; limit?: number } } | undefined)
    ?.pagination;
  const pageSize = pagination?.limit ?? (data as { limit?: number } | undefined)?.limit ?? PAGE_SIZE;
  const apiTotal =
    pagination?.total ?? (data as { total?: number } | undefined)?.total ?? rows.length;
  // With the client-side source filter on, the API total no longer describes
  // what's on screen — fall back to the visible count.
  const total = source ? contacts.length : apiTotal;

  const selectClass = cn(inputClass, "sm:w-44 cursor-pointer bg-white");

  return (
    <div>
      <PageHeader
        title="Contacts"
        description="Everyone who has ever messaged your WhatsApp business number."
        action={
          <Button onClick={() => setModalOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Add Contact
          </Button>
        }
      />

      {/* Filter bar */}
      <Card className="mb-4 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
                {tag.name}
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
            {CONTACT_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <ContactTable
        contacts={contacts}
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
      />

      <AddContactModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
