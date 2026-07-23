"use client";

import { useState } from "react";
import {
  Building2,
  CheckCircle,
  Clock3,
  FileText,
  Mail,
  Phone,
  Sparkles,
  StickyNote,
  Ticket as TicketIcon,
  UserRound,
} from "lucide-react";
import { Avatar, Badge, Button, Skeleton, inputClass } from "@/components/ui";
import {
  CONVERSATION_STATUS_STYLE,
  SCORE_STYLE,
  cn,
  formatCurrency,
  formatDate,
  scoreLabelFor,
} from "@/lib/utils";
import {
  contactName,
  contactTags,
  type InboxAgent,
  type InboxConversation,
  type InboxLead,
} from "./ConversationList";

type PanelTab = "notes" | "activity" | "tickets";

const PANEL_TABS: { id: PanelTab; label: string }[] = [
  { id: "notes", label: "Notes" },
  { id: "activity", label: "Activity" },
  { id: "tickets", label: "Tickets" },
];

/** Remounted per conversation via `key`, so tab + assignee state resets for free. */
export function ContactPanel({
  conversation,
  agents,
  isLoading,
  className,
}: {
  conversation: InboxConversation | null;
  agents: InboxAgent[];
  isLoading?: boolean;
  className?: string;
}) {
  const [tab, setTab] = useState<PanelTab>("notes");
  const [assignee, setAssignee] = useState<string>(
    conversation?.assignedTo?.id ?? conversation?.assignedToId ?? "",
  );

  if (!conversation) {
    return (
      <aside
        className={cn(
          "flex flex-col items-center justify-center border-l border-slate-200 bg-white px-6 text-center",
          className,
        )}
      >
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          <UserRound className="h-6 w-6 text-slate-400" />
        </span>
        <p className="text-sm font-medium text-slate-900">No contact selected</p>
        <p className="mt-1 text-sm text-slate-500">
          Open a conversation to see the contact, their lead and quick actions.
        </p>
      </aside>
    );
  }

  const contact = conversation.contact ?? null;
  const name = contactName(conversation);
  const tags = contactTags(contact);
  const lead = resolveLead(conversation);
  const status = conversation.status ?? "OPEN";

  return (
    <aside
      className={cn(
        "scrollbar-slim flex flex-col overflow-y-auto border-l border-slate-200 bg-white",
        className,
      )}
    >
      {/* Identity */}
      <div className="flex flex-col items-center border-b border-slate-100 px-4 py-6 text-center">
        <Avatar name={name} src={contact?.avatarUrl} size="lg" />
        <p className="mt-3 w-full truncate text-sm font-semibold text-slate-900">{name}</p>

        <div className="mt-1 space-y-0.5 text-xs text-slate-500">
          {contact?.phone && (
            <p className="flex items-center justify-center gap-1.5">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{contact.phone}</span>
            </p>
          )}
          {contact?.email && (
            <p className="flex items-center justify-center gap-1.5">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{contact.email}</span>
            </p>
          )}
          {contact?.company && (
            <p className="flex items-center justify-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{contact.company}</span>
            </p>
          )}
        </div>

        {isLoading && <Skeleton className="mt-3 h-4 w-24" />}
      </div>

      {/* Lead */}
      <Section title="Lead">
        {lead ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {lead.stage?.name && (
                <Badge className="bg-slate-100 text-slate-700 ring-slate-500/20">
                  {lead.stage.name}
                </Badge>
              )}
              <Badge className={SCORE_STYLE[scoreLabelOf(lead)]}>
                {scoreLabelOf(lead)}
                {lead.score != null && ` · ${lead.score}`}
              </Badge>
            </div>
            {lead.value != null && (
              <p className="text-sm font-semibold text-slate-900">
                {formatCurrency(lead.value, lead.currency ?? "INR")}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-400">No lead linked to this contact yet.</p>
        )}
      </Section>

      {/* Tags */}
      <Section title="Tags">
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => {
              const color = tag.color || "#64748b";
              return (
                <span
                  key={tag.id}
                  className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
                  style={{
                    color,
                    borderColor: `${color}55`,
                    backgroundColor: `${color}14`,
                  }}
                >
                  {tag.name}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-slate-400">No tags.</p>
        )}
      </Section>

      {/* Quick actions */}
      <Section title="Quick actions">
        <div className="space-y-2">
          {/* TODO [GAURANSH]: wire /api/ai/qualify — { conversationId } → score + BANT. */}
          <Button variant="secondary" size="sm" className="w-full justify-start">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            Qualify Lead (AI)
          </Button>
          {/* TODO [GAURANSH]: wire /api/ai/summarize — { conversationId } → { summary }. */}
          <Button variant="secondary" size="sm" className="w-full justify-start">
            <FileText className="h-4 w-4 text-emerald-600" />
            Summarize (AI)
          </Button>
          {/* TODO [GAURANSH]: wire PATCH /api/conversations/[id] { status: "RESOLVED" }. */}
          <Button variant="secondary" size="sm" className="w-full justify-start">
            <CheckCircle className="h-4 w-4 text-emerald-600" />
            Resolve
          </Button>
        </div>
      </Section>

      {/* Assign */}
      <Section title="Assign agent">
        {/* TODO [GAURANSH]: wire PATCH /api/conversations/[id] { assigneeId }. */}
        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          aria-label="Assign agent"
          className={cn(inputClass, "bg-white")}
        >
          <option value="">Unassigned</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name || "Agent"}
            </option>
          ))}
        </select>
      </Section>

      {/* Details */}
      <Section title="Conversation">
        <dl className="space-y-2 text-xs">
          <Detail label="Created" value={formatDate(conversation.createdAt)} />
          <Detail
            label="Assigned"
            value={agents.find((a) => a.id === assignee)?.name || "Unassigned"}
          />
          <Detail label="Channel" value={conversation.channel ?? "WHATSAPP"} />
          <Detail
            label="Status"
            value={
              <Badge className={CONVERSATION_STATUS_STYLE[status]}>
                {String(status).toLowerCase()}
              </Badge>
            }
          />
        </dl>
      </Section>

      {/* Tabs */}
      <div className="mt-auto border-t border-slate-100">
        <div role="tablist" aria-label="Contact details" className="flex border-b border-slate-100">
          {PANEL_TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex-1 border-b-2 px-2 py-2.5 text-xs font-medium transition",
                  active
                    ? "border-emerald-600 text-emerald-700"
                    : "border-transparent text-slate-500 hover:text-slate-700",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="px-4 py-5">
          {tab === "notes" && (
            <TabPlaceholder
              icon={StickyNote}
              title="No notes yet"
              description="Toggle “Internal note” in the composer to leave a note for your team."
            />
          )}
          {tab === "activity" && (
            <TabPlaceholder
              icon={Clock3}
              title="No activity yet"
              description={`Conversation opened ${formatDate(conversation.createdAt)}. Stage changes and assignments will land here.`}
            />
          )}
          {tab === "tickets" && (
            <TabPlaceholder
              icon={TicketIcon}
              title="No tickets"
              description="Escalate this conversation to create a support ticket."
              action={
                /* TODO [GAURANSH]: wire POST /api/tickets. */
                <Button variant="secondary" size="sm">
                  <TicketIcon className="h-4 w-4" />
                  Create ticket
                </Button>
              }
            />
          )}
        </div>
      </div>
    </aside>
  );
}

// ─── Bits ─────────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-slate-100 px-4 py-4">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="shrink-0 text-slate-400">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-slate-700">{value}</dd>
    </div>
  );
}

function TabPlaceholder({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
        <Icon className="h-4 w-4 text-slate-400" />
      </span>
      <p className="text-xs font-medium text-slate-700">{title}</p>
      <p className="mt-1 text-xs text-slate-400">{description}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveLead(conversation: InboxConversation): InboxLead | null {
  return conversation.lead ?? conversation.contact?.leads?.[0] ?? null;
}

function scoreLabelOf(lead: InboxLead) {
  return lead.scoreLabel ?? scoreLabelFor(lead.score ?? 0);
}
