"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2, Search, SearchX, UserPlus, Users, WifiOff } from "lucide-react";
import { useContacts } from "@/hooks/useContacts";
import { useCreateConversation } from "@/hooks/useMessages";
import { Avatar, Button, EmptyState, Modal, Skeleton, inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";

/** The shape of a contact row this picker needs. The list API returns much more. */
interface ContactOption {
  id: string;
  name?: string | null;
  phone?: string | null;
  company?: string | null;
  avatarUrl?: string | null;
}

/** How many contacts one page of the picker shows. */
const PAGE_LIMIT = 8;

/**
 * Start a conversation with one of the workspace's saved contacts.
 *
 * The picker searches contacts server-side rather than filtering a page in the browser: a workspace
 * can hold far more contacts than one page, and a search box that only matched what happened to be
 * loaded would report "no matches" for contacts that plainly exist.
 *
 * Choosing a contact does not create anything by itself — POST /api/conversations returns the
 * existing thread when there is one — so double-clicking a name, or picking someone an agent has
 * already spoken to, opens the conversation they already have instead of splitting its history.
 */
export function NewConversationModal({
  open,
  onClose,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  /** Called with the resolved conversation id so the inbox can select it. */
  onStarted: (conversationId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createConversation = useCreateConversation();

  // One request per pause in typing, not per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  /**
   * Close and forget.
   *
   * The reset lives on the close path rather than in an effect watching `open`, because closing is
   * the event — every route out of this modal (the X, the backdrop, Escape, picking a contact) ends
   * up here, so there is exactly one place the search and any error are cleared, and no render
   * happens just to discard state the user has already dismissed.
   */
  const close = () => {
    setSearch("");
    setDebounced("");
    setPendingId(null);
    setError(null);
    onClose();
  };

  const { data, isLoading, isError, refetch } = useContacts({
    search: debounced || undefined,
    limit: PAGE_LIMIT,
  });

  const contacts = useMemo<ContactOption[]>(() => {
    const rows = (data as { data?: unknown } | undefined)?.data;
    return Array.isArray(rows) ? (rows as ContactOption[]) : [];
  }, [data]);

  const total = (data as { pagination?: { total?: number } } | undefined)?.pagination?.total ?? contacts.length;
  const hasQuery = debounced.length > 0;

  const start = async (contact: ContactOption) => {
    if (createConversation.isPending) return;
    setError(null);
    setPendingId(contact.id);
    try {
      const conversation = await createConversation.mutateAsync({ contactId: contact.id });
      onStarted(conversation.id);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the conversation");
      setPendingId(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="New conversation"
      description="Pick a saved contact to open their thread and start chatting."
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, email or company…"
            aria-label="Search contacts"
            className={cn(inputClass, "pl-9")}
            autoFocus
          />
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
          >
            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="min-h-56">
          {isLoading ? (
            <ul className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="flex items-center gap-3 rounded-lg px-2 py-2">
                  <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-2/5" />
                    <Skeleton className="h-3 w-3/5" />
                  </div>
                </li>
              ))}
            </ul>
          ) : isError ? (
            <EmptyState
              icon={WifiOff}
              title="Can't load contacts"
              description="The contacts service didn't respond. Check your connection and try again."
              action={
                <Button variant="secondary" onClick={() => void refetch()}>
                  Try again
                </Button>
              }
            />
          ) : contacts.length === 0 ? (
            hasQuery ? (
              <EmptyState
                icon={SearchX}
                title="No matches"
                description={`Nothing matched "${debounced}". Try a different name or phone number.`}
              />
            ) : (
              <EmptyState
                icon={Users}
                title="No contacts yet"
                description="Add a contact first — a conversation needs someone to talk to."
                action={
                  <Link href="/contacts">
                    <Button variant="secondary">
                      <UserPlus className="h-4 w-4" />
                      Go to contacts
                    </Button>
                  </Link>
                }
              />
            )
          ) : (
            <ul className="scrollbar-slim max-h-64 space-y-1 overflow-y-auto">
              {contacts.map((contact) => {
                const name = contact.name?.trim() || contact.phone || "Unnamed contact";
                const isPending = pendingId === contact.id;
                return (
                  <li key={contact.id}>
                    <button
                      type="button"
                      onClick={() => void start(contact)}
                      disabled={createConversation.isPending}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition",
                        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600",
                        "hover:bg-slate-50 disabled:opacity-60",
                      )}
                    >
                      <Avatar name={name} src={contact.avatarUrl} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">
                          {name}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {[contact.phone, contact.company].filter(Boolean).join(" · ") || "No phone on file"}
                        </span>
                      </span>
                      {isPending && (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-600" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* The list is capped, so say so rather than letting it look like the whole address book. */}
        {!isLoading && !isError && total > contacts.length && (
          <p className="text-xs text-slate-400">
            Showing {contacts.length} of {total} contacts — refine your search to narrow the list.
          </p>
        )}
      </div>
    </Modal>
  );
}
