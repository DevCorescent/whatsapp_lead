"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  MoreHorizontal,
  Pencil,
  Tag as TagIcon,
  Trash2,
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
  isBlocked?: boolean | null;
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
}) {
  const router = useRouter();
  const [menu, setMenu] = useState<{ id: string; top: number; right: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
      {notice && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          {notice}
        </div>
      )}

      {/* Bulk toolbar */}
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-emerald-50/60 px-4 py-2.5">
          <span className="text-sm font-medium text-emerald-900">
            {selected.length} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                // TODO [SHALMON]: implement POST /api/contacts/bulk-tag
                setNotice("Backend not wired yet — bulk tagging needs POST /api/contacts/bulk-tag.")
              }
            >
              <TagIcon className="h-3.5 w-3.5" />
              Add tag
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() =>
                // TODO [SHALMON]: implement DELETE /api/contacts/[id]
                setNotice("Backend not wired yet — DELETE /api/contacts/[id] returns 501.")
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
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
          title="No contacts yet"
          description={
            isError
              ? "Add your first contact or import from WhatsApp. (GET /api/contacts is not implemented yet.)"
              : "Add your first contact or import from WhatsApp."
          }
          action={
            <Button onClick={onAddContact}>
              <UserPlus className="h-4 w-4" />
              Add Contact
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto">
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
                          <p className="truncate font-medium text-slate-900">
                            {contact.name ?? "Unnamed"}
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
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setMenu(null);
                // TODO [SHALMON]: implement PATCH /api/contacts/[id]
                setNotice("Backend not wired yet — PATCH /api/contacts/[id] returns 501.");
              }}
            >
              <Pencil className="h-4 w-4 text-slate-400" />
              Edit
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
              onClick={() => {
                setMenu(null);
                // TODO [SHALMON]: implement DELETE /api/contacts/[id]
                setNotice("Backend not wired yet — DELETE /api/contacts/[id] returns 501.");
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
