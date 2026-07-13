"use client";

import { useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ticket as TicketIcon, Plus, AlertTriangle, Clock } from "lucide-react";
import type { Ticket, TicketPriority, TicketStatus } from "@prisma/client";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  SkeletonRows,
  inputClass,
} from "@/components/ui";
import {
  cn,
  formatDate,
  formatTime,
  TICKET_PRIORITY_STYLE,
  TICKET_STATUS_STYLE,
} from "@/lib/utils";


/** Tickets come back joined with the contact and the assigned agent. */
type TicketRow = Ticket & {
  contact?: { id: string; name: string; phone?: string | null } | null;
  conversation?: { contact?: { name: string; phone?: string | null } | null } | null;
  assignedTo?: { id: string; name: string; avatar?: string | null } | null;
};

const STATUS_TABS: { key: "ALL" | TicketStatus; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "OPEN", label: "Open" },
  { key: "ASSIGNED", label: "Assigned" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "CLOSED", label: "Closed" },
];

const PRIORITIES: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const DEPARTMENTS = ["Support", "Sales", "Billing", "Technical", "Onboarding"];

const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: "Open",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

function useTickets(filters: { status: string; priority: string; department: string }) {
  return useQuery<TicketRow[]>({
    queryKey: ["tickets", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.status !== "ALL") params.set("status", filters.status);
      if (filters.priority !== "ALL") params.set("priority", filters.priority);
      if (filters.department !== "ALL") params.set("department", filters.department);
      const res = await fetch(`/api/tickets?${params}`);
      if (!res.ok) throw new Error(`Failed to load tickets (${res.status})`);
      const json = await res.json();
      return Array.isArray(json) ? json : (json.data ?? []);
    },
    retry: false,
  });
}

/**
 * The wall clock is an external mutable source, so it is read through
 * useSyncExternalStore rather than calling Date.now() during render. Snapshots are
 * bucketed to the minute to stay stable, and the server snapshot is 0 ("unknown")
 * so an "Overdue" chip can never cause a hydration mismatch.
 */
const subscribeToClock = (onChange: () => void) => {
  const id = setInterval(onChange, 30_000);
  return () => clearInterval(id);
};
const clockSnapshot = () => Math.floor(Date.now() / 60_000) * 60_000;
const serverClockSnapshot = () => 0;

function useNow() {
  return useSyncExternalStore(subscribeToClock, clockSnapshot, serverClockSnapshot);
}

function SlaCell({
  deadline,
  status,
  now,
}: {
  deadline: Date | string | null;
  status: TicketStatus;
  now: number;
}) {
  if (!deadline) return <span className="text-slate-400">—</span>;
  const d = typeof deadline === "string" ? new Date(deadline) : deadline;
  const settled = status === "RESOLVED" || status === "CLOSED";
  const overdue = now > 0 && !settled && d.getTime() < now;

  if (overdue) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">
        <AlertTriangle className="h-3 w-3" />
        Overdue
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-slate-600">
      <Clock className="h-3 w-3 text-slate-400" />
      {formatDate(d)}, {formatTime(d)}
    </span>
  );
}

export default function TicketsPage() {
  const [status, setStatus] = useState<"ALL" | TicketStatus>("ALL");
  const [priority, setPriority] = useState("ALL");
  const [department, setDepartment] = useState("ALL");
  const [open, setOpen] = useState(false);
  const now = useNow();

  const { data, isLoading, isError } = useTickets({ status, priority, department });
  const tickets = data ?? [];

  return (
    <div>
      <PageHeader
        title="Tickets"
        description="Track support requests raised from WhatsApp conversations."
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            New Ticket
          </Button>
        }
      />

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="scrollbar-slim flex gap-1 overflow-x-auto border-b border-slate-200">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatus(t.key)}
              className={cn(
                "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition",
                status === t.key
                  ? "border-emerald-600 text-emerald-700"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter by priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className={cn(inputClass, "w-auto py-1.5 text-xs")}
          >
            <option value="ALL">All priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0) + p.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by department"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className={cn(inputClass, "w-auto py-1.5 text-xs")}
          >
            <option value="ALL">All departments</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-4">
            <SkeletonRows rows={6} />
          </div>
        ) : isError || tickets.length === 0 ? (
          <EmptyState
            icon={TicketIcon}
            title={isError ? "Tickets aren't available yet" : "No tickets found"}
            description={
              isError
                ? "The tickets API is still being built. Once it's live, every support request will land here with its SLA countdown."
                : "Nothing matches these filters. Raise a ticket from a conversation, or create one manually."
            }
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />
                New Ticket
              </Button>
            }
          />
        ) : (
          <div className="scrollbar-slim overflow-x-auto">
            <table className="w-full min-w-[60rem] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Subject</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Priority</th>
                  <th className="px-4 py-3 font-medium">Department</th>
                  <th className="px-4 py-3 font-medium">Assigned</th>
                  <th className="px-4 py-3 font-medium">SLA</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tickets.map((t) => {
                  const contact = t.contact ?? t.conversation?.contact ?? null;
                  return (
                    <tr key={t.id} className="cursor-pointer hover:bg-slate-50">
                      <td className="max-w-xs px-4 py-3">
                        <p className="truncate font-medium text-slate-900">{t.subject}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                          #{t.id.slice(-6).toUpperCase()}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {contact ? (
                          <div className="flex items-center gap-2">
                            <Avatar name={contact.name} size="sm" />
                            <span className="min-w-0">
                              <span className="block truncate text-slate-800">{contact.name}</span>
                              {contact.phone && (
                                <span className="block truncate text-xs text-slate-400">
                                  {contact.phone}
                                </span>
                              )}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={TICKET_STATUS_STYLE[t.status]}>
                          {STATUS_LABEL[t.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={TICKET_PRIORITY_STYLE[t.priority]}>{t.priority}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{t.department || "—"}</td>
                      <td className="px-4 py-3">
                        {t.assignedTo ? (
                          <div className="flex items-center gap-2">
                            <Avatar name={t.assignedTo.name} src={t.assignedTo.avatar} size="sm" />
                            <span className="truncate text-slate-700">{t.assignedTo.name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <SlaCell deadline={t.slaDeadline} status={t.status} now={now} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                        {formatDate(t.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <NewTicketModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function NewTicketModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState("");
  const [contact, setContact] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("MEDIUM");
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [sla, setSla] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async (data: { subject: string; priority: TicketPriority; department: string }) => {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create ticket");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      setSubject(""); setContact(""); setPriority("MEDIUM"); setDepartment(DEPARTMENTS[0]);
      setSla(""); setDetails(""); setError(null);
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Ticket"
      description="Raise a support ticket and set its SLA deadline."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          create.mutate({ subject, priority, department });
        }}
      >
        <Field label="Subject" htmlFor="ticket-subject" required>
          <input
            id="ticket-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className={inputClass}
            placeholder="Payment failed on renewal"
          />
        </Field>

        <Field label="Contact" htmlFor="ticket-contact" required>
          <input
            id="ticket-contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            className={inputClass}
            placeholder="Search by name or phone…"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Priority" htmlFor="ticket-priority">
            <select
              id="ticket-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TicketPriority)}
              className={inputClass}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Department" htmlFor="ticket-department">
            <select
              id="ticket-department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className={inputClass}
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="SLA deadline" htmlFor="ticket-sla">
          <input
            id="ticket-sla"
            type="datetime-local"
            value={sla}
            onChange={(e) => setSla(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Details" htmlFor="ticket-details">
          <textarea
            id="ticket-details"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={3}
            className={cn(inputClass, "resize-y")}
            placeholder="What went wrong?"
          />
        </Field>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!subject.trim() || create.isPending}>
            {create.isPending ? "Creating…" : "Create Ticket"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
