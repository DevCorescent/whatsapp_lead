"use client";

/**
 * Website CMS overview (SUPER_ADMIN).
 *
 * Every homepage section with whether it has been customised, whether it is
 * visible, and how many of its items are shown. Each card opens the editor.
 *
 * Data: GET /api/admin/cms/sections.
 */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ChevronRight, ExternalLink, EyeOff, MessageCircle, TriangleAlert } from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminPageHeader,
  AdminSkeleton,
} from "@/components/admin/ui";
import { SECTIONS_QUERY_KEY } from "@/components/admin/cms/SectionEditor";

interface SectionSummary {
  key: string;
  label: string;
  description: string;
  whatsapp: boolean;
  isActive: boolean;
  source: "saved" | "default";
  updatedAt: string | null;
  itemCount: number;
  activeItemCount: number;
}

export default function CmsOverviewPage() {
  const query = useQuery<SectionSummary[]>({
    queryKey: SECTIONS_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/admin/cms/sections");
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) throw new Error(json.error ?? `Failed to load (${res.status})`);
      return json.data;
    },
  });

  return (
    <>
      <AdminPageHeader
        title="Website CMS"
        description="Edit the public homepage section by section. Saved changes go live on the website immediately."
        action={
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900"
          >
            <ExternalLink className="h-4 w-4" />
            View website
          </a>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="font-semibold uppercase tracking-wider text-slate-400">Home page</span>
        <span className="inline-flex items-center gap-1.5">
          <MessageCircle className="h-3.5 w-3.5 text-emerald-500" />
          Contains WhatsApp chat or product content
        </span>
      </div>

      {query.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <AdminSkeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <AdminCard className="flex items-start gap-3 p-5">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-semibold text-slate-900">Website content could not be loaded</p>
            <p className="mt-1 text-sm text-slate-500">{(query.error as Error).message}</p>
          </div>
        </AdminCard>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {query.data?.map((section) => (
            <Link
              key={section.key}
              href={`/admin/cms/${section.key}`}
              className="group flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B6E4F]"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  {section.label}
                  {section.whatsapp && <MessageCircle aria-label="WhatsApp content" className="h-3.5 w-3.5 text-emerald-500" />}
                </h2>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#0B6E4F]" />
              </div>
              <p className="mt-1 line-clamp-2 flex-1 text-xs leading-relaxed text-slate-500">{section.description}</p>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <AdminBadge tone={section.source === "saved" ? "sky" : "slate"}>
                  {section.source === "saved" ? "Customised" : "Default"}
                </AdminBadge>
                {!section.isActive && (
                  <AdminBadge tone="amber">
                    <EyeOff className="h-3 w-3" />
                    Hidden
                  </AdminBadge>
                )}
                {section.itemCount > 0 && (
                  <span className="text-[11px] text-slate-500">
                    {section.activeItemCount} of {section.itemCount} items shown
                  </span>
                )}
              </div>

              <p className="mt-2 text-[11px] text-slate-400">
                {section.updatedAt
                  ? `Updated ${formatDistanceToNow(new Date(section.updatedAt), { addSuffix: true })}`
                  : "Never edited"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
