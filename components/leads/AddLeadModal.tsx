"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, Plus } from "lucide-react";
import type { LeadStage } from "@prisma/client";
import { createLeadSchema } from "@/lib/validators/lead";
import { useContacts } from "@/hooks/useContacts";
import { useLeadStages } from "@/hooks/useLeadStages";
import { Button, Field, Modal, inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";

type ContactOption = { id: string; name: string; phone?: string | null };

/** The contacts API is a 501 stub too — accept any plausible shape, never throw. */
function normalizeContacts(raw: unknown): ContactOption[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? ((raw as Record<string, unknown>).data ?? (raw as Record<string, unknown>).contacts)
      : null;
  if (!Array.isArray(list)) return [];
  return list.flatMap((c) => {
    if (!c || typeof c !== "object") return [];
    const rec = c as Record<string, unknown>;
    if (typeof rec.id !== "string") return [];
    return [
      {
        id: rec.id,
        name: typeof rec.name === "string" ? rec.name : "Unnamed contact",
        phone: typeof rec.phone === "string" ? rec.phone : null,
      },
    ];
  });
}

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED"];

const EMPTY_FORM = {
  title: "",
  contactId: "",
  stage: "NEW_LEAD" as LeadStage,
  value: "",
  currency: "INR",
  budget: "",
  authority: "",
  requirement: "",
  timeline: "",
  notes: "",
};

/**
 * The form only exists while the modal is open, so every open starts from a
 * clean slate — including the stage of the column it was launched from. Resetting
 * from an effect on `open` would trip react-hooks/set-state-in-effect.
 */
export function AddLeadModal({
  open,
  onClose,
  initialStage = "NEW_LEAD",
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  initialStage?: LeadStage;
  onCreated?: () => void;
}) {
  if (!open) return null;
  return <AddLeadForm onClose={onClose} initialStage={initialStage} onCreated={onCreated} />;
}

function AddLeadForm({
  onClose,
  initialStage,
  onCreated,
}: {
  onClose: () => void;
  initialStage: LeadStage;
  onCreated?: () => void;
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM, stage: initialStage });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const contactsQuery = useContacts();
  const contacts = useMemo(
    () => normalizeContacts(contactsQuery.data),
    [contactsQuery.data],
  );
  const contactsUnavailable = contacts.length === 0;

  // Stage options come from the backend via the shared hook. React Query caches
  // the list, so opening the modal after the board loaded shows the stages
  // instantly and stays in sync if they change (optimistic refresh).
  const { stages, isLoading: stagesLoading } = useLeadStages();
  const stagesUnavailable = stages.length === 0;

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);

    const payload = {
      title: form.title.trim(),
      contactId: form.contactId,
      stage: form.stage,
      value: form.value ? Number(form.value) : undefined,
      currency: form.currency,
      budget: form.budget.trim() || undefined,
      requirement: form.requirement.trim() || undefined,
      timeline: form.timeline.trim() || undefined,
      notes: form.notes.trim() || undefined,
      // `authority` isn't in createLeadSchema, so it rides along outside the parse.
      authority: form.authority.trim() || undefined,
    };

    const parsed = createLeadSchema.safeParse(payload);
    const fieldErrors: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        // The contact picker is disabled until the contacts API lands — don't
        // hold the user hostage to a field they physically cannot fill in.
        if (key === "contactId" && contactsUnavailable) continue;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
    }
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;

    setSaving(true);
    try {
      // TODO [GAURANSH]: POST /api/leads — currently returns 501 Not Implemented.
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setBanner(
          res.status === 501
            ? "The leads API isn't live yet (501). Nothing was saved — your details are still here."
            : `Couldn't save this lead (HTTP ${res.status}). Please try again.`,
        );
        return;
      }
      onCreated?.();
      onClose();
    } catch {
      setBanner("Network error — couldn't reach the leads API. Nothing was saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add Lead"
      description="Create a new deal in the pipeline."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {banner && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-600/20"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{banner}</span>
          </div>
        )}

        <Field label="Title" htmlFor="lead-title" required error={errors.title}>
          <input
            id="lead-title"
            className={inputClass}
            placeholder="e.g. 200-seat CRM rollout"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            autoFocus
          />
        </Field>

        <Field label="Contact" htmlFor="lead-contact" error={errors.contactId}>
          <select
            id="lead-contact"
            className={cn(inputClass, contactsUnavailable && "cursor-not-allowed bg-slate-50 text-slate-400")}
            value={form.contactId}
            disabled={contactsUnavailable}
            onChange={(e) => set("contactId", e.target.value)}
          >
            {contactsUnavailable ? (
              <option value="">
                {contactsQuery.isLoading ? "Loading contacts…" : "No contacts loaded"}
              </option>
            ) : (
              <>
                <option value="">Select a contact…</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.phone ? ` — ${c.phone}` : ""}
                  </option>
                ))}
              </>
            )}
          </select>
          {contactsUnavailable && !contactsQuery.isLoading && (
            <p className="mt-1 text-xs text-slate-400">
              The contacts API isn&apos;t live yet, so there&apos;s nothing to pick from.
            </p>
          )}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Stage" htmlFor="lead-stage">
            <select
              id="lead-stage"
              className={cn(inputClass, stagesUnavailable && "cursor-not-allowed bg-slate-50 text-slate-400")}
              value={form.stage}
              disabled={stagesUnavailable}
              onChange={(e) => set("stage", e.target.value as LeadStage)}
            >
              {stagesUnavailable ? (
                <option value="">{stagesLoading ? "Loading stages…" : "No stages available"}</option>
              ) : (
                stages.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))
              )}
            </select>
          </Field>

          <Field label="Value" htmlFor="lead-value" error={errors.value}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                ₹
              </span>
              <input
                id="lead-value"
                type="number"
                min={0}
                step={1000}
                className={cn(inputClass, "pl-7")}
                placeholder="50000"
                value={form.value}
                onChange={(e) => set("value", e.target.value)}
              />
            </div>
          </Field>

          <Field label="Currency" htmlFor="lead-currency">
            <select
              id="lead-currency"
              className={inputClass}
              value={form.currency}
              onChange={(e) => set("currency", e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Budget" htmlFor="lead-budget">
            <input
              id="lead-budget"
              className={inputClass}
              placeholder="₹5L confirmed"
              value={form.budget}
              onChange={(e) => set("budget", e.target.value)}
            />
          </Field>
          <Field label="Authority" htmlFor="lead-authority">
            <input
              id="lead-authority"
              className={inputClass}
              placeholder="Speaking to the VP of Sales"
              value={form.authority}
              onChange={(e) => set("authority", e.target.value)}
            />
          </Field>
          <Field label="Requirement" htmlFor="lead-requirement">
            <input
              id="lead-requirement"
              className={inputClass}
              placeholder="WhatsApp automation for support"
              value={form.requirement}
              onChange={(e) => set("requirement", e.target.value)}
            />
          </Field>
          <Field label="Timeline" htmlFor="lead-timeline">
            <input
              id="lead-timeline"
              className={inputClass}
              placeholder="Within 30 days"
              value={form.timeline}
              onChange={(e) => set("timeline", e.target.value)}
            />
          </Field>
        </div>

        <Field label="Notes" htmlFor="lead-notes">
          <textarea
            id="lead-notes"
            rows={3}
            className={cn(inputClass, "resize-y")}
            placeholder="Anything the team should know before the next call…"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {saving ? "Saving…" : "Create Lead"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
