"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  Eye,
  MoreHorizontal,
  Pencil,
  Tag as TagIcon,
  Trash2,
  Undo2,
  UserPlus,
  Users,
} from "lucide-react";
import { Avatar, Badge, Button, Card, EmptyState, SkeletonRows } from "@/components/ui";
import { cn, stageColorClasses, timeAgo } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
// The backend is still a 501 stub, so nothing about the payload shape is
// guaranteed. Every field is optional and every accessor below is defensive.

export type TagChip = { id: string; name: string; color: string };

export type ContactRow = {
  id: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  designation?: string | null;
  location?: string | null;
  source?: string | null;
  avatarUrl?: string | null;
  notes?: string | null;
  /** Soft-deleted. (Blocking a number is the blacklist — see `blacklisted`.) */
  isBlocked?: boolean | null;
  /** The number is on the account's or the platform's blacklist. */
  blacklisted?: boolean | null;
  optedOut?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastActivityAt?: string | null;
  tags?: unknown;
  leads?: { stage?: ContactStageRef | null }[] | null;
  lead?: { stage?: ContactStageRef | null } | null;
};

/** The pipeline stage a contact's lead sits in, as included by the contact APIs. */
export type ContactStageRef = { id?: string | null; name?: string | null; color?: string | null };

/** Tags may arrive as `Tag[]` or as the join rows `ContactTag[] { tag: Tag }`. */
export function contactTags(input: unknown): TagChip[] {
  if (!Array.isArray(input)) return [];
  const chips: TagChip[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const src = (
      row.tag && typeof row.tag === "object" ? row.tag : row
    ) as Record<string, unknown>;
    const name = typeof src.name === "string" ? src.name : null;
    if (!name) continue;
    chips.push({
      id: typeof src.id === "string" ? src.id : name,
      name,
      color: typeof src.color === "string" ? src.color : "#64748b",
    });
  }
  return chips;
}

export function contactStage(contact: ContactRow): ContactStageRef | null {
  return contact.leads?.[0]?.stage ?? contact.lead?.stage ?? null;
}

export function contactLastActivity(contact: ContactRow) {
  return contact.lastActivityAt ?? contact.updatedAt ?? contact.createdAt ?? null;
}

// ─── Small presentational bits ────────────────────────────────────────────────

export function TagPill({ tag }: { tag: TagChip }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-black/5"
      style={{ backgroundColor: `${tag.color}1a`, color: tag.color }}
    >
      {tag.name}
    </span>
  );
}

export function StageBadge({ stage }: { stage: ContactStageRef | null }) {
  // Name + colour come straight from the stage relation the API includes on the lead —
  // fully dynamic, no lookup or hardcoded labels.
  if (!stage?.name) return <span className="text-xs text-slate-400">—</span>;
  const { dot } = stageColorClasses(stage.color);
  return (
    <Badge className="gap-1.5">
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {stage.name}
    </Badge>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────

export type RowAction = "delete" | "restore" | "block" | "unblock" | "addTag";
export interface ContactPermissions {
  delete: boolean;
  block: boolean;
  manage: boolean;
}

export function ContactTable({
  contacts,
  isLoading,
  isError,
  selected,
  onSelectedChange,
  page,
  pageSize,
  total,
  onPageChange,
  onAddContact,
  onEditContact,
  onDeleteContact,
  onAction,
  permissions,
  showingDeleted = false,
  emptyMessage,
}: {
  contacts: ContactRow[];
  isLoading: boolean;
  isError: boolean;
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onAddContact: () => void;
  /** Open the edit form for a row. The page owns the modal. */
  onEditContact: (contact: ContactRow) => void;
  /** Ask to delete a row; the page confirms before anything is sent. */
  onDeleteContact: (contact: ContactRow) => void;
  /** Block / unblock / restore one row, or act on the selection. The page owns the requests. */
  onAction: (action: RowAction, contacts: ContactRow[]) => void;
  /** What the user may do; actions they can't are not offered. */
  permissions: ContactPermissions;
  /** Showing deleted contacts: rows offer Restore instead of Edit/Delete. */
  showingDeleted?: boolean;
  /** Replaces the "No contacts yet" empty state, e.g. when filters match nothing. */
  emptyMessage?: { title: string; description: string };
}) {
  const router = useRouter();
  const [menu, setMenu] = useState<{ id: string; top: number; right: number } | null>(null);

  // The dropdown is positioned `fixed` so the horizontally scrollable table
  // cannot clip it — that means it has to close when the page moves under it.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  const selectedRows = contacts.filter((c) => selected.includes(c.id));
  const menuContact = menu ? contacts.find((c) => c.id === menu.id) ?? null : null;
  const allSelected = contacts.length > 0 && selected.length === contacts.length;
  const someSelected = selected.length > 0 && !allSelected;

  const toggleAll = () => onSelectedChange(allSelected ? [] : contacts.map((c) => c.id));
  const toggleOne = (id: string) =>
    onSelectedChange(
      selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id],
    );

  const openMenu = (e: React.MouseEvent<HTMLButtonElement>, id: string) => {
    e.stopPropagation();
    if (menu?.id === id) return setMenu(null);
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu({
      id,
      top: rect.bottom + 6,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  };

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const hasNext = page * pageSize < total;
  const isEmpty = !isLoading && contacts.length === 0;

  return (
    <Card className="overflow-hidden">
      {/* Bulk toolbar */}
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-emerald-50/60 px-4 py-2.5">
          <span className="text-sm font-medium text-emerald-900">
            {selected.length} selected
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {!showingDeleted && permissions.manage && (
              <Button variant="secondary" size="sm" onClick={() => onAction("addTag", selectedRows)}>
                <TagIcon className="h-3.5 w-3.5" />
                Add tag
              </Button>
            )}
            {permissions.block && (
              <>
                <Button variant="secondary" size="sm" onClick={() => onAction("block", selectedRows)}>
                  <Ban className="h-3.5 w-3.5" />
                  Block
                </Button>
                {selectedRows.some((c) => c.blacklisted) && (
                  <Button variant="secondary" size="sm" onClick={() => onAction("unblock", selectedRows)}>
                    <Ban className="h-3.5 w-3.5" />
                    Unblock
                  </Button>
                )}
              </>
            )}
            {permissions.delete &&
              (showingDeleted ? (
                <Button variant="secondary" size="sm" onClick={() => onAction("restore", selectedRows)}>
                  <Undo2 className="h-3.5 w-3.5" />
                  Restore
                </Button>
              ) : (
                <Button variant="danger" size="sm" onClick={() => onAction("delete", selectedRows)}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="p-4">
          <SkeletonRows rows={6} />
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon={Users}
          title={emptyMessage?.title ?? "No contacts yet"}
          description={
            emptyMessage?.description ??
            (isError ? "The contacts could not be loaded. Refresh to try again." : "Add your first contact or import from WhatsApp.")
          }
          action={
            emptyMessage ? undefined : (
              <Button onClick={onAddContact}>
                <UserPlus className="h-4 w-4" />
                Add Contact
              </Button>
            )
          }
        />
      ) : (
        <>
        {/* Phones: one card per contact instead of a 900px table to swipe through. */}
        <ul className="divide-y divide-slate-100 md:hidden">
          {contacts.map((contact) => {
            const tags = contactTags(contact.tags);
            const checked = selected.includes(contact.id);
            return (
              <li
                key={contact.id}
                className={cn("flex items-start gap-3 px-4 py-3", checked && "bg-emerald-50/40")}
              >
                <input
                  type="checkbox"
                  aria-label={`Select ${contact.name ?? "contact"}`}
                  className="mt-3 h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300 accent-emerald-600"
                  checked={checked}
                  onChange={() => toggleOne(contact.id)}
                />
                <button
                  type="button"
                  onClick={() => router.push(`/contacts/${contact.id}`)}
                  className="flex min-w-0 flex-1 items-start gap-3 text-left"
                >
                  <Avatar name={contact.name} src={contact.avatarUrl} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-medium text-slate-900">{contact.name ?? "Unnamed"}</span>
                      {contact.blacklisted && (
                        <Badge className="bg-rose-50 text-rose-700 ring-rose-600/20">Blocked</Badge>
                      )}
                      {contact.isBlocked && <Badge>Deleted</Badge>}
                    </span>
                    <span className="block text-sm text-slate-600">{contact.phone ?? "—"}</span>
                    {(tags.length > 0 || contactStage(contact)) && (
                      <span className="mt-1.5 flex flex-wrap items-center gap-1">
                        {tags.slice(0, 2).map((tag) => (
                          <TagPill key={tag.id} tag={tag} />
                        ))}
                        {tags.length > 2 && <span className="text-xs text-slate-400">+{tags.length - 2}</span>}
                        {contactStage(contact) && <StageBadge stage={contactStage(contact)} />}
                      </span>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Row actions"
                  onClick={(e) => openMenu(e, contact.id)}
                  className="-mr-2 shrink-0 rounded-lg p-2.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
        {/* `relative` keeps the header's absolutely-positioned sr-only label inside the
            scroller; without it the label escaped and widened the whole page on phones. */}
        <div className="relative hidden overflow-x-auto md:block">
          <table className="w-full min-w-225 text-sm">
            <thead className="bg-slate-50 text-left">
              <tr className="border-b border-slate-200">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all contacts"
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-emerald-600"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleAll}
                  />
                </th>
                {["Name", "Phone", "Email", "Company", "Tags", "Lead stage", "Last activity"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500"
                    >
                      {h}
                    </th>
                  ),
                )}
                <th className="w-12 px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contacts.map((contact) => {
                const tags = contactTags(contact.tags);
                const checked = selected.includes(contact.id);
                return (
                  <tr
                    key={contact.id}
                    onClick={() => router.push(`/contacts/${contact.id}`)}
                    className={cn(
                      "cursor-pointer transition hover:bg-slate-50",
                      checked && "bg-emerald-50/40",
                    )}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${contact.name ?? "contact"}`}
                        className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-emerald-600"
                        checked={checked}
                        onChange={() => toggleOne(contact.id)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={contact.name} src={contact.avatarUrl} size="sm" />
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 truncate font-medium text-slate-900">
                            <span className="truncate">{contact.name ?? "Unnamed"}</span>
                            {contact.blacklisted && (
                              <Badge className="shrink-0 bg-rose-50 text-rose-700 ring-rose-600/20">Blocked</Badge>
                            )}
                            {contact.isBlocked && <Badge className="shrink-0">Deleted</Badge>}
                          </p>
                          {contact.designation && (
                            <p className="truncate text-xs text-slate-500">
                              {contact.designation}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {contact.phone ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="block max-w-45 truncate">{contact.email || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="block max-w-40 truncate">{contact.company || "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      {tags.length === 0 ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {tags.slice(0, 2).map((tag) => (
                            <TagPill key={tag.id} tag={tag} />
                          ))}
                          {tags.length > 2 && (
                            <span className="text-xs text-slate-400">+{tags.length - 2}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StageBadge stage={contactStage(contact)} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                      {timeAgo(contactLastActivity(contact)) || "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        aria-label="Row actions"
                        onClick={(e) => openMenu(e, contact.id)}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* Pagination */}
      {!isEmpty && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-500">
            {isLoading ? "Loading…" : `Showing ${from}–${to} of ${total}`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1 || isLoading}
              onClick={() => onPageChange(Math.max(1, page - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!hasNext || isLoading}
              onClick={() => onPageChange(page + 1)}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Row action dropdown — fixed so the scroll container can't clip it */}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} aria-hidden />
          <div
            className="fixed z-50 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
            style={{ top: menu.top, right: menu.right }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => {
                const id = menu.id;
                setMenu(null);
                router.push(`/contacts/${id}`);
              }}
            >
              <Eye className="h-4 w-4 text-slate-400" />
              View
            </button>
            {menuContact && !showingDeleted && permissions.manage && (
              <MenuItem icon={Pencil} label="Edit" onClick={() => { setMenu(null); onEditContact(menuContact); }} />
            )}
            {menuContact && permissions.block && (
              <MenuItem
                icon={Ban}
                label={menuContact.blacklisted ? "Unblock" : "Block"}
                onClick={() => { setMenu(null); onAction(menuContact.blacklisted ? "unblock" : "block", [menuContact]); }}
              />
            )}
            {menuContact && permissions.delete &&
              (showingDeleted ? (
                <MenuItem icon={Undo2} label="Restore" onClick={() => { setMenu(null); onAction("restore", [menuContact]); }} />
              ) : (
                <MenuItem icon={Trash2} label="Delete" danger onClick={() => { setMenu(null); onDeleteContact(menuContact); }} />
              ))}
          </div>
        </>
      )}
    </Card>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger = false,
}: {
  icon: typeof Eye;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-sm",
        danger ? "text-rose-600 hover:bg-rose-50" : "text-slate-700 hover:bg-slate-50",
      )}
      onClick={onClick}
    >
      <Icon className={cn("h-4 w-4", !danger && "text-slate-400")} />
      {label}
    </button>
  );
}
