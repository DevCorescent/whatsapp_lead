"use client";

import { useState } from "react";
import { ImagePlus, Save, AlertTriangle } from "lucide-react";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";

// TODO [SHALMON]: PATCH /api/settings (general) + DELETE /api/settings/workspace.

const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
];

export function GeneralTab() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [domain, setDomain] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [confirm, setConfirm] = useState("");

  return (
    <div className="space-y-5">
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

        <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">
          <Button>
            <Save className="h-4 w-4" />
            Save Changes
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
