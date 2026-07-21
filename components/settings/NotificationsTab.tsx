"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button, Card, SkeletonRows } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useSettings, useUpdateSettings, type SettingsData } from "@/hooks/useSettings";

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
type Prefs = Record<EventKey, Record<Channel, boolean>>;

const FALLBACK: Prefs = {
  newMessage: { email: false, inApp: true },
  leadAssigned: { email: true, inApp: true },
  slaBreach: { email: true, inApp: true },
  campaignCompleted: { email: true, inApp: false },
  weeklySummary: { email: true, inApp: false },
};

type Banner = { kind: "success" | "error"; text: string } | null;

export function NotificationsTab() {
  const { data: settings, isLoading, isError } = useSettings();

  if (isLoading) {
    return (
      <Card className="p-5">
        <SkeletonRows rows={6} />
      </Card>
    );
  }

  if (isError || !settings) {
    return (
      <Card className="p-5 text-sm text-rose-600">
        Couldn&apos;t load notification settings. Please refresh and try again.
      </Card>
    );
  }

  return <NotificationsForm settings={settings} />;
}

function NotificationsForm({ settings }: { settings: SettingsData }) {
  const update = useUpdateSettings();

  // Merge stored prefs over the fallback so a newly-added event always has a value.
  const initial: Prefs = { ...FALLBACK };
  for (const { key } of EVENTS) {
    const stored = settings.notifications?.[key];
    if (stored) initial[key] = { email: !!stored.email, inApp: !!stored.inApp };
  }

  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [banner, setBanner] = useState<Banner>(null);

  const toggle = (key: EventKey, channel: Channel) =>
    setPrefs((p) => ({ ...p, [key]: { ...p[key], [channel]: !p[key][channel] } }));

  const save = async () => {
    setBanner(null);
    try {
      await update.mutateAsync({ section: "notifications", data: prefs });
      setBanner({ kind: "success", text: "Notification preferences saved." });
    } catch (e) {
      setBanner({ kind: "error", text: e instanceof Error ? e.message : "Failed to save." });
    }
  };

  return (
    <div className="space-y-5">
      {banner && (
        <div
          role="status"
          className={cn(
            "rounded-lg px-4 py-2.5 text-sm ring-1 ring-inset",
            banner.kind === "success"
              ? "bg-emerald-50 text-emerald-800 ring-emerald-600/20"
              : "bg-rose-50 text-rose-700 ring-rose-600/20",
          )}
        >
          {banner.text}
        </div>
      )}

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
            <li
              key={e.key}
              className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4"
            >
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
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Preferences
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
