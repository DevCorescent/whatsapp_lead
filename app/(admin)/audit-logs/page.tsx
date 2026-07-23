"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, Search } from "lucide-react";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  AdminSkeletonRows,
  AdminTable,
  tdClass,
  thClass,
} from "@/components/admin/ui";
import { inputClass } from "@/components/ui";
import { cn, formatDate, timeAgo } from "@/lib/utils";

type LogEntry = {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  createdAt: string;
  tenant: { name: string; slug: string } | null;
  user: { name: string; email: string } | null;
};

function useAuditLogs(search: string, page: number) {
  return useQuery<{ data: LogEntry[]; total: number }>({
    queryKey: ["admin", "audit-logs", search, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (search) params.set("q", search);
      const r = await fetch(`/api/admin/audit-logs?${params}`);
      if (!r.ok) throw new Error("Failed to load audit logs");
      const j = await r.json();
      return j.data ?? { data: [], total: 0 };
    },
    retry: false,
    staleTime: 30_000,
  });
}

const ACTION_COLOR: Record<string, string> = {
  CONTACT_DELETED: "text-rose-700",
  LEAD_CREATED: "text-emerald-700",
  TICKET_CREATED: "text-sky-700",
  AI_QUALIFICATION: "text-violet-700",
  USER_INVITED: "text-amber-700",
};

export default function AuditLogsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAuditLogs(search, page);

  const logs = data?.data ?? [];
  const total = data?.total ?? 0;
  const pages = Math.ceil(total / 50);

  return (
    <>
      <AdminPageHeader
        title="Audit Logs"
        description="Every action across all workspaces, in chronological order."
      />

      <div className="mb-4 flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by action or user…"
            className={cn(inputClass, "border-slate-200 bg-white pl-9 text-slate-900 placeholder:text-slate-400 focus:ring-[#0B6E4F]")}
          />
        </div>
        {total > 0 && (
          <span className="shrink-0 text-sm text-slate-500">{total.toLocaleString()} entries</span>
        )}
      </div>

      <AdminPanel title="Log entries" bodyClassName="p-0">
        {isLoading ? (
          <div className="p-5"><AdminSkeletonRows rows={10} /></div>
        ) : logs.length === 0 ? (
          <AdminEmptyState
            icon={ScrollText}
            title="No audit logs yet"
            description="Actions taken by users across all workspaces will appear here."
          />
        ) : (
          <AdminTable>
            <thead className="border-b border-slate-200 bg-[#FAFAFA]">
              <tr>
                <th className={thClass}>Timestamp</th>
                <th className={thClass}>Action</th>
                <th className={thClass}>Resource</th>
                <th className={thClass}>User</th>
                <th className={thClass}>Workspace</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {logs.map((log) => (
                <tr key={log.id} className="transition hover:bg-slate-50">
                  <td className={tdClass}>
                    <span className="text-slate-500" title={log.createdAt}>
                      {timeAgo(new Date(log.createdAt))}
                    </span>
                    <span className="ml-2 hidden text-xs text-slate-400 lg:inline">
                      {formatDate(log.createdAt)}
                    </span>
                  </td>
                  <td className={tdClass}>
                    <code className={cn("text-xs font-mono", ACTION_COLOR[log.action] ?? "text-slate-700")}>
                      {log.action}
                    </code>
                  </td>
                  <td className={tdClass}>
                    <span className="text-slate-500">{log.resource}</span>
                    {log.resourceId && (
                      <span className="ml-1.5 font-mono text-xs text-slate-400">
                        #{log.resourceId.slice(-6)}
                      </span>
                    )}
                  </td>
                  <td className={tdClass}>
                    {log.user ? (
                      <div>
                        <p className="text-sm text-slate-900">{log.user.name}</p>
                        <p className="text-xs text-slate-500">{log.user.email}</p>
                      </div>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className={tdClass}>
                    {log.tenant ? (
                      <span className="text-slate-700">{log.tenant.name}</span>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        )}
      </AdminPanel>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-40">
            Previous
          </button>
          <span className="text-sm text-slate-500">Page {page} of {pages}</span>
          <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-40">
            Next
          </button>
        </div>
      )}
    </>
  );
}