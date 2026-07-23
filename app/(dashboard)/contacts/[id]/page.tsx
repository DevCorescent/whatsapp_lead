"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Activity as ActivityIcon,
  AlertTriangle,
  ArrowLeft,
  MessageSquare,
  Pencil,
  TrendingUp,
  Trash2,
  UserX,
} from "lucide-react";
import type { LeadScoreLabel } from "@prisma/client";
import { useContact } from "@/hooks/useContacts";
import { Avatar, Badge, Button, Card, EmptyState, Skeleton } from "@/components/ui";
import {
  StageBadge,
  TagPill,
  contactTags,
  type ContactRow,
  type ContactStageRef,
  type TagChip,
} from "@/components/contacts/ContactTable";
import {
  CONVERSATION_STATUS_STYLE,
  SCORE_STYLE,
  cn,
  formatCurrency,
  formatDate,
  scoreLabelFor,
  timeAgo,
} from "@/lib/utils";

// ─── Types (all optional — the API is still a 501 stub) ───────────────────────

type ConversationLite = {
  id: string;
  status?: string | null;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
  updatedAt?: string | null;
  unreadCount?: number | null;
};

type ActivityLite = {
  id: string;
  type?: string | null;
  content?: string | null;
  createdAt?: string | null;
  user?: { name?: string | null } | null;
};

type LeadLite = {
  id: string;
  title?: string | null;
  stage?: ContactStageRef | null;
  score?: number | null;
  scoreLabel?: LeadScoreLabel | null;
  value?: number | null;
  currency?: string | null;
  createdAt?: string | null;
  activities?: ActivityLite[] | null;
};

type ContactDetail = Omit<ContactRow, "leads"> & {
  conversations?: ConversationLite[] | null;
  leads?: LeadLite[] | null;
  activities?: ActivityLite[] | null;
};

const TABS = ["Overview", "Conversations", "Leads", "Activity"] as const;
type Tab = (typeof TABS)[number];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContactDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = typeof params?.id === "string" ? params.id : "";

  const { data, isLoading, isError } = useContact(id);
  const [tab, setTab] = useState<Tab>("Overview");
  const [notice, setNotice] = useState<string | null>(null);

  // The payload may be the contact itself or wrapped in { data }. Neither is
  // guaranteed while the route returns 501 — normalise, then verify.
  const contact = useMemo<ContactDetail | null>(() => {
    if (!data || typeof data !== "object") return null;
    const payload = (data as { data?: unknown }).data ?? data;
    if (!payload || typeof payload !== "object") return null;
    const candidate = payload as ContactDetail;
    return typeof candidate.id === "string" ? candidate : null;
  }, [data]);

  if (isLoading) return <DetailSkeleton />;

  if (isError || !contact) {
    return (
      <Card className="py-6">
        <EmptyState
          icon={UserX}
          title="Contact not found"
          description="This contact could not be loaded — GET /api/contacts/[id] is not implemented yet."
          action={
            <Link href="/contacts">
              <Button variant="secondary">
                <ArrowLeft className="h-4 w-4" />
                Back to contacts
              </Button>
            </Link>
          }
        />
      </Card>
    );
  }

  const tags: TagChip[] = contactTags(contact.tags);
  const conversations = contact.conversations ?? [];
  const leads = contact.leads ?? [];
  const activities = contact.activities ?? leads.flatMap((lead) => lead.activities ?? []);

  return (
    <div className="space-y-4">
      <Link
        href="/contacts"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to contacts
      </Link>

      {notice && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Header card */}
      <Card className="p-5 lg:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar name={contact.name} src={contact.avatarUrl} size="xl" />
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                {contact.name ?? "Unnamed contact"}
              </h1>
              <p className="mt-0.5 text-sm text-slate-500">
                {[contact.designation, contact.company].filter(Boolean).join(" · ") ||
                  "No company on file"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                <span>{contact.phone ?? "—"}</span>
                {contact.email && <span className="truncate">{contact.email}</span>}
                {contact.location && <span>{contact.location}</span>}
              </div>
              {tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <TagPill key={tag.id} tag={tag} />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => router.push("/inbox")}>
              <MessageSquare className="h-4 w-4" />
              Message
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                // TODO [SHALMON]: implement PATCH /api/contacts/[id]
                setNotice("Backend not wired yet — PATCH /api/contacts/[id] returns 501.")
              }
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                // TODO [SHALMON]: implement DELETE /api/contacts/[id]
                setNotice("Backend not wired yet — DELETE /api/contacts/[id] returns 501.")
              }
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition",
              tab === t
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700",
            )}
          >
            {t}
            {t === "Conversations" && conversations.length > 0 && (
              <span className="ml-1.5 text-xs text-slate-400">{conversations.length}</span>
            )}
            {t === "Leads" && leads.length > 0 && (
              <span className="ml-1.5 text-xs text-slate-400">{leads.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "Overview" && <OverviewTab contact={contact} />}
      {tab === "Conversations" && <ConversationsTab conversations={conversations} />}
      {tab === "Leads" && <LeadsTab leads={leads} />}
      {tab === "Activity" && <ActivityTab activities={activities} />}
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-2.5 last:border-0 sm:flex-row sm:items-center sm:gap-4">
      <dt className="w-32 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="min-w-0 truncate text-sm text-slate-800">{value || "—"}</dd>
    </div>
  );
}

function OverviewTab({ contact }: { contact: ContactDetail }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-5 lg:col-span-2">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Contact details</h2>
        <dl className="grid gap-x-8 sm:grid-cols-2">
          <div>
            <Row label="Name" value={contact.name} />
            <Row label="Phone" value={contact.phone} />
            <Row label="Email" value={contact.email} />
            <Row label="Company" value={contact.company} />
            <Row label="Designation" value={contact.designation} />
          </div>
          <div>
            <Row label="Location" value={contact.location} />
            <Row label="Source" value={contact.source} />
            <Row label="Created" value={contact.createdAt ? formatDate(contact.createdAt) : null} />
            <Row
              label="Last updated"
              value={contact.updatedAt ? formatDate(contact.updatedAt) : null}
            />
            <Row
              label="Status"
              value={contact.isBlocked ? "Blocked" : contact.optedOut ? "Opted out" : "Active"}
            />
          </div>
        </dl>
      </Card>

      <Card className="p-5">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Notes</h2>
        {contact.notes ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
            {contact.notes}
          </p>
        ) : (
          <p className="text-sm text-slate-400">No notes for this contact yet.</p>
        )}
      </Card>
    </div>
  );
}

function ConversationsTab({ conversations }: { conversations: ConversationLite[] }) {
  if (conversations.length === 0) {
    return (
      <Card className="py-4">
        <EmptyState
          icon={MessageSquare}
          title="No conversations"
          description="Messages exchanged with this contact will appear here."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {conversations.map((conversation) => {
        const status = conversation.status ?? "OPEN";
        return (
          <Card key={conversation.id} className="p-4 transition hover:border-slate-300">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    className={CONVERSATION_STATUS_STYLE[status] ?? CONVERSATION_STATUS_STYLE.OPEN}
                  >
                    {status}
                  </Badge>
                  {!!conversation.unreadCount && conversation.unreadCount > 0 && (
                    <Badge className="bg-emerald-600 text-white ring-emerald-600">
                      {conversation.unreadCount} unread
                    </Badge>
                  )}
                </div>
                <p className="mt-2 truncate text-sm text-slate-600">
                  {conversation.lastMessagePreview || "No messages yet."}
                </p>
              </div>
              <span className="shrink-0 text-xs text-slate-400">
                {timeAgo(conversation.lastMessageAt ?? conversation.updatedAt)}
              </span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function LeadsTab({ leads }: { leads: LeadLite[] }) {
  if (leads.length === 0) {
    return (
      <Card className="py-4">
        <EmptyState
          icon={TrendingUp}
          title="No leads"
          description="Qualify this contact from the inbox to open a lead."
        />
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {leads.map((lead) => {
        const score = lead.score ?? 0;
        const label = lead.scoreLabel ?? scoreLabelFor(score);
        return (
          <Card key={lead.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-slate-900">{lead.title || "Untitled lead"}</p>
              <Badge className={SCORE_STYLE[label]}>
                {label} · {score}
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <StageBadge stage={lead.stage ?? null} />
              <span className="text-sm font-semibold text-slate-900">
                {formatCurrency(lead.value, lead.currency ?? "INR")}
              </span>
              {lead.createdAt && (
                <span className="ml-auto text-xs text-slate-400">
                  Opened {timeAgo(lead.createdAt)}
                </span>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function ActivityTab({ activities }: { activities: ActivityLite[] }) {
  if (activities.length === 0) {
    return (
      <Card className="py-4">
        <EmptyState
          icon={ActivityIcon}
          title="No activity yet"
          description="Stage changes, notes and AI qualifications will show up on this timeline."
        />
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <ol className="relative space-y-6 border-l border-slate-200 pl-6">
        {activities.map((activity) => (
          <li key={activity.id} className="relative">
            <span className="absolute -left-6.75 top-1.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-white" />
            <p className="text-sm font-medium text-slate-900">
              {(activity.type ?? "ACTIVITY").replace(/_/g, " ")}
            </p>
            {activity.content && (
              <p className="mt-0.5 text-sm text-slate-600">{activity.content}</p>
            )}
            <p className="mt-1 text-xs text-slate-400">
              {[activity.user?.name, timeAgo(activity.createdAt)].filter(Boolean).join(" · ") ||
                "—"}
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ─── Loading ──────────────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-32" />
      <Card className="p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-20 w-20 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      </Card>
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 lg:col-span-2" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}
