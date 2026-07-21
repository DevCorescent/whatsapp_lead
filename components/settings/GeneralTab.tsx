"use client";

import { useState } from "react";
import { ImagePlus, Loader2, Save, AlertTriangle } from "lucide-react";
import { Button, Card, Field, inputClass, SkeletonRows } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useSettings, useUpdateSettings, type SettingsData } from "@/hooks/useSettings";

const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "es", label: "Spanish" },
  { value: "ar", label: "Arabic" },
  { value: "pt", label: "Portuguese" },
  { value: "fr", label: "French" },
];

type Banner = { kind: "success" | "error"; text: string } | null;

export function GeneralTab() {
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
        Couldn&apos;t load settings. Please refresh and try again.
      </Card>
    );
  }

  return <GeneralForm settings={settings} />;
}

function GeneralForm({ settings }: { settings: SettingsData }) {
  const update = useUpdateSettings();
  const g = settings.general;

  const [name, setName] = useState(g.workspaceName);
  const [slug, setSlug] = useState(g.slug);
  const [domain, setDomain] = useState(g.domain);
  const [language, setLanguage] = useState(g.language);
  const [timezone, setTimezone] = useState(g.timezone);
  const [confirm, setConfirm] = useState("");
  const [banner, setBanner] = useState<Banner>(null);

  const save = async () => {
    setBanner(null);
    try {
      await update.mutateAsync({
        section: "general",
        data: {
          workspaceName: name.trim(),
          slug: slug.trim(),
          domain: domain.trim(),
          language,
          timezone,
        },
      });
      setBanner({ kind: "success", text: "Workspace settings saved." });
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

      <Card className="p-5">
        <h2 className="font-semibold text-slate-900">Workspace</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          How your workspace appears to your team and your customers.
        </p>

        <div className="mt-5 flex flex-col gap-5 sm:flex-row">
          {/* Logo */}
          <div className="shrink-0">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Logo</span>
            <button
              type="button"
              className="flex h-28 w-28 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-400 transition hover:border-emerald-400 hover:bg-emerald-50/40 hover:text-emerald-600"
            >
              <ImagePlus className="h-6 w-6" />
              <span className="text-xs font-medium">Upload</span>
            </button>
            <p className="mt-1.5 w-28 text-center text-[11px] text-slate-400">PNG or SVG, 1:1</p>
          </div>

          <div className="flex-1 space-y-4">
            <Field label="Workspace name" htmlFor="ws-name" required>
              <input
                id="ws-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="Acme Realty"
              />
            </Field>

            <Field label="Slug" htmlFor="ws-slug" required>
              <div className="flex items-stretch">
                <span className="inline-flex items-center rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-500">
                  whatscrm.app/
                </span>
                <input
                  id="ws-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className={cn(inputClass, "rounded-l-none")}
                  placeholder="acme-realty"
                />
              </div>
            </Field>

            <Field label="Custom domain" htmlFor="ws-domain">
              <input
                id="ws-domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className={inputClass}
                placeholder="crm.acmerealty.com"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Point a CNAME at <code className="font-mono">cname.whatscrm.app</code> to use it.
              </p>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Language" htmlFor="ws-lang">
                <select
                  id="ws-lang"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className={inputClass}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Timezone" htmlFor="ws-tz">
                <select
                  id="ws-tz"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className={inputClass}
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Danger zone */}
      <Card className="border-rose-300 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-rose-700">Danger zone</h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Deleting this workspace permanently removes every contact, conversation, lead and
              campaign. This cannot be undone.
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={cn(inputClass, "sm:max-w-xs")}
                placeholder="Type DELETE to confirm"
                aria-label="Type DELETE to confirm"
              />
              <Button variant="danger" disabled={confirm !== "DELETE"}>
                Delete Workspace
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
