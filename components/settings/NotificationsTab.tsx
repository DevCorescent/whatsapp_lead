"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { Button, Card } from "@/components/ui";

// TODO [SHALMON]: PATCH /api/settings (notifications).

type Channel = "email" | "inApp";

const EVENTS = [
  {
    key: "newMessage",
    label: "New message",
    hint: "A customer sends a message to an unassigned conversation.",
  },
  {
    key: "leadAssigned",
    label: "Lead assigned",
    hint: "A lead is assigned to you or to someone on your team.",
  },
  {
    key: "slaBreach",
    label: "Ticket SLA breach",
    hint: "A ticket passes its SLA deadline without being resolved.",
  },
  {
    key: "campaignCompleted",
    label: "Campaign completed",
    hint: "A broadcast finishes sending to its whole audience.",
  },
  {
    key: "weeklySummary",
    label: "Weekly summary",
    hint: "A digest of conversations, leads and revenue every Monday.",
  },
] as const;

type EventKey = (typeof EVENTS)[number]["key"];

const INITIAL: Record<EventKey, Record<Channel, boolean>> = {
  newMessage: { email: false, inApp: true },
  leadAssigned: { email: true, inApp: true },
  slaBreach: { email: true, inApp: true },
  campaignCompleted: { email: true, inApp: false },
  weeklySummary: { email: true, inApp: false },
};

export function NotificationsTab() {
  const [prefs, setPrefs] = useState(INITIAL);

  const toggle = (key: EventKey, channel: Channel) =>
    setPrefs((p) => ({ ...p, [key]: { ...p[key], [channel]: !p[key][channel] } }));

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="font-semibold text-slate-900">Notifications</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Choose how you want to hear about each event.
        </p>
      </div>

      {/* Column headers — hidden on mobile where the checkboxes are labelled inline */}
      <div className="hidden items-center gap-4 border-b border-slate-200 bg-slate-50 px-5 py-2 text-xs font-medium uppercase tracking-wide text-slate-500 sm:flex">
        <span className="flex-1">Event</span>
        <span className="w-16 text-center">Email</span>
        <span className="w-16 text-center">In-app</span>
      </div>

      <ul className="divide-y divide-slate-100">
        {EVENTS.map((e) => (
          <li key={e.key} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800">{e.label}</p>
              <p className="mt-0.5 text-xs text-slate-500">{e.hint}</p>
            </div>

            <div className="flex gap-6 sm:gap-0">
              <label className="flex w-16 cursor-pointer items-center justify-center gap-2">
                <input
                  type="checkbox"
                  checked={prefs[e.key].email}
                  onChange={() => toggle(e.key, "email")}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  aria-label={`${e.label} — email`}
                />
                <span className="text-xs text-slate-500 sm:hidden">Email</span>
              </label>
              <label className="flex w-16 cursor-pointer items-center justify-center gap-2">
                <input
                  type="checkbox"
                  checked={prefs[e.key].inApp}
                  onChange={() => toggle(e.key, "inApp")}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  aria-label={`${e.label} — in-app`}
                />
                <span className="text-xs text-slate-500 sm:hidden">In-app</span>
              </label>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex justify-end border-t border-slate-200 px-5 py-4">
        <Button>
          <Save className="h-4 w-4" />
          Save Preferences
        </Button>
      </div>
    </Card>
  );
}
