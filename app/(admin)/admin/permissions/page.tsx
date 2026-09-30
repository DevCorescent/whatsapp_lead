"use client";

// Super admin → role permissions: the matrix for client and reseller accounts.
// Cells outside an account type's ceiling are locked (e.g. no reseller role can
// ever read chats or send messages); the rest can be granted or revoked, or
// reset to the default.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Lock, Minus } from "lucide-react";
import { AdminPageHeader, AdminSkeletonRows, Segmented } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

interface Cell { permission: string; available: boolean; byDefault: boolean; override: boolean | null; effective: boolean }
interface Matrix {
  permissions: string[];
  matrix: { accountType: "CLIENT" | "RESELLER"; roles: { role: string; permissions: Cell[] }[] }[];
}

const ROLE_LABEL: Record<string, string> = {
  TENANT_OWNER: "Owner", ADMIN: "Admin", MANAGER: "Manager", MARKETING_USER: "Marketing", AGENT: "Agent",
};

export default function AdminPermissionsPage() {
  const qc = useQueryClient();
  const [accountType, setAccountType] = useState<"CLIENT" | "RESELLER">("CLIENT");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "permissions"],
    queryFn: async () => {
      const res = await fetch("/api/admin/permissions");
      if (!res.ok) throw new Error("Failed to load permissions");
      return (await res.json()).data as Matrix;
    },
  });

  const set = useMutation({
    mutationFn: async (v: { role: string; permission: string; allowed: boolean | null }) => {
      const res = await fetch("/api/admin/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountType, ...v }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Update failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "permissions"] }),
  });

  const view = data?.matrix.find((m) => m.accountType === accountType);
  // Only permissions that exist for this account type are worth a row.
  const rows = (data?.permissions ?? []).filter((p) => view?.roles.some((r) => r.permissions.find((c) => c.permission === p)?.available));

  return (
    <>
      <AdminPageHeader
        title="Role permissions"
        description="What each staff role can do, per account type. Click a cell to cycle: default → allowed → denied → default."
        action={
          <Segmented
            value={accountType}
            onChange={setAccountType}
            options={[{ value: "CLIENT", label: "Client accounts" }, { value: "RESELLER", label: "Reseller accounts" }]}
          />
        }
      />
      {accountType === "RESELLER" && (
        <p className="mb-4 flex items-center gap-1.5 text-xs text-slate-500">
          <Lock className="h-3.5 w-3.5" /> Reseller accounts can never read client chats, see contacts or send messages — those permissions don&apos;t exist for them.
        </p>
      )}
      {set.isError && <p className="mb-3 text-xs text-rose-700">{(set.error as Error).message}</p>}
      {isLoading || !view ? (
        <AdminSkeletonRows rows={10} />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
          <table className="w-full min-w-2xl text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Permission</th>
                {view.roles.map((r) => <th key={r.role} className="px-3 py-2.5 font-medium">{ROLE_LABEL[r.role] ?? r.role}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((permission) => (
                <tr key={permission}>
                  <td className="px-4 py-2 font-mono text-xs text-slate-700">{permission}</td>
                  {view.roles.map((r) => {
                    const cell = r.permissions.find((c) => c.permission === permission)!;
                    // default → allowed → denied → default
                    const next = cell.override === null ? true : cell.override ? false : null;
                    return (
                      <td key={r.role} className="px-3 py-2 text-center">
                        <button
                          type="button"
                          disabled={set.isPending}
                          onClick={() => set.mutate({ role: r.role, permission, allowed: next })}
                          title={cell.override === null ? "Default" : "Overridden — click to change"}
                          className={cn(
                            "inline-flex h-7 w-7 items-center justify-center rounded-md ring-1 ring-inset transition",
                            cell.effective ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-50 text-slate-400 ring-slate-200",
                            cell.override !== null && "ring-2 ring-amber-400",
                          )}
                          aria-label={`${permission} for ${ROLE_LABEL[r.role] ?? r.role}: ${cell.effective ? "allowed" : "denied"}`}
                        >
                          {cell.effective ? <Check className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">Amber outline = changed from the default. Changes apply within 30 seconds.</p>
        </div>
      )}
    </>
  );
}
