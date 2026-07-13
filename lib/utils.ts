import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { LeadStage, LeadScoreLabel, TicketStatus, TicketPriority } from "@prisma/client";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Deterministic avatar colour so the same contact always gets the same chip. */
export function avatarColor(seed?: string | null) {
  const palette = [
    "bg-rose-500",
    "bg-orange-500",
    "bg-amber-500",
    "bg-emerald-500",
    "bg-teal-500",
    "bg-sky-500",
    "bg-indigo-500",
    "bg-violet-500",
    "bg-fuchsia-500",
  ];
  if (!seed) return palette[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

export function formatCurrency(value?: number | null, currency = "INR") {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCompact(value?: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** "2m", "5h", "Yesterday", "12 Mar" — the WhatsApp-style relative stamp. */
export function timeAgo(date?: Date | string | null) {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return "now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  if (secs < 172800) return "Yesterday";
  if (secs < 604800) return `${Math.floor(secs / 86400)}d`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function formatTime(date?: Date | string | null) {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(date?: Date | string | null) {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Groups messages under "Today" / "Yesterday" / "12 March 2026" separators. */
export function dayLabel(date?: Date | string | null) {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, yest)) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

export function daysBetween(from?: Date | string | null) {
  if (!from) return 0;
  const d = typeof from === "string" ? new Date(from) : from;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

// ─── Domain display maps ──────────────────────────────────────────────────────

export const LEAD_STAGES: { stage: LeadStage; label: string; accent: string; dot: string }[] = [
  { stage: "NEW_LEAD", label: "New Lead", accent: "border-t-blue-400", dot: "bg-blue-400" },
  { stage: "CONTACTED", label: "Contacted", accent: "border-t-violet-400", dot: "bg-violet-400" },
  { stage: "QUALIFIED", label: "Qualified", accent: "border-t-amber-400", dot: "bg-amber-400" },
  { stage: "PROPOSAL_SENT", label: "Proposal Sent", accent: "border-t-orange-400", dot: "bg-orange-400" },
  { stage: "NEGOTIATION", label: "Negotiation", accent: "border-t-pink-400", dot: "bg-pink-400" },
  { stage: "WON", label: "Won", accent: "border-t-emerald-500", dot: "bg-emerald-500" },
  { stage: "LOST", label: "Lost", accent: "border-t-rose-400", dot: "bg-rose-400" },
];

export const STAGE_LABEL: Record<LeadStage, string> = Object.fromEntries(
  LEAD_STAGES.map((s) => [s.stage, s.label]),
) as Record<LeadStage, string>;

/** COLD 0-30 | WARM 31-60 | HOT 61-80 | QUALIFIED 81-100 */
export const SCORE_STYLE: Record<LeadScoreLabel, string> = {
  COLD: "bg-blue-50 text-blue-700 ring-blue-600/20",
  WARM: "bg-amber-50 text-amber-800 ring-amber-600/20",
  HOT: "bg-orange-50 text-orange-700 ring-orange-600/20",
  QUALIFIED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

export function scoreLabelFor(score: number): LeadScoreLabel {
  if (score <= 30) return "COLD";
  if (score <= 60) return "WARM";
  if (score <= 80) return "HOT";
  return "QUALIFIED";
}

export const CONVERSATION_STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  ASSIGNED: "bg-sky-50 text-sky-700 ring-sky-600/20",
  RESOLVED: "bg-slate-100 text-slate-600 ring-slate-500/20",
  CLOSED: "bg-slate-100 text-slate-500 ring-slate-500/20",
};

export const TICKET_STATUS_STYLE: Record<TicketStatus, string> = {
  OPEN: "bg-sky-50 text-sky-700 ring-sky-600/20",
  ASSIGNED: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  IN_PROGRESS: "bg-amber-50 text-amber-800 ring-amber-600/20",
  RESOLVED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  CLOSED: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

export const TICKET_PRIORITY_STYLE: Record<TicketPriority, string> = {
  LOW: "bg-slate-100 text-slate-600 ring-slate-500/20",
  MEDIUM: "bg-sky-50 text-sky-700 ring-sky-600/20",
  HIGH: "bg-orange-50 text-orange-700 ring-orange-600/20",
  URGENT: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

/**
 * Every API route is still a 501 stub while Shalmon and Gauransh finish the
 * backend, so a failed fetch is the expected path, not an exception. Callers
 * use this to fall back to an empty view instead of an error screen.
 */
export function isNotImplemented(error: unknown) {
  return error instanceof Error && error.message.includes("501");
}
