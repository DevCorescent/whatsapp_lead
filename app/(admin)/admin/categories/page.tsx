"use client";

// Super-admin editor for the business-category list (IT, Real Estate, Education, …)
// that accounts choose from in Settings.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, Plus, Tags, Trash2 } from "lucide-react";
import {
  AdminButton,
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  AdminSkeletonRows,
  AdminTable,
  tdClass,
  thClass,
} from "@/components/admin/ui";
import { inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";

interface Category {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  accounts: number;
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json;
}

export default function AdminCategoriesPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<Category[]>({
    queryKey: ["admin", "categories"],
    queryFn: async () => (await send("/api/admin/categories", "GET")).data,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
  const onError = (e: Error) => setError(e.message);

  const create = useMutation({
    mutationFn: () => send("/api/admin/categories", "POST", { name: name.trim() }),
    onSuccess: () => { setName(""); setError(null); refresh(); },
    onError,
  });
  const update = useMutation({
    mutationFn: (v: { id: string; patch: Partial<Pick<Category, "name" | "isActive" | "sortOrder">> }) =>
      send(`/api/admin/categories/${v.id}`, "PATCH", v.patch),
    onSuccess: () => { setError(null); refresh(); },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => send(`/api/admin/categories/${id}`, "DELETE"),
    onSuccess: () => { setError(null); refresh(); },
    onError,
  });

  const categories = data ?? [];

  return (
    <div>
      <AdminPageHeader
        title="Business categories"
        description="The industries accounts can pick in Settings. Deactivate a category to hide it without detaching accounts that use it."
      />

      <AdminPanel title="Add a category">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(); }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            className={cn(inputClass, "sm:max-w-sm")}
            placeholder="e.g. Hospitality"
            aria-label="Category name"
          />
          <AdminButton type="submit" disabled={!name.trim() || create.isPending}>
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </AdminButton>
        </form>
        {error && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-rose-700">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}
      </AdminPanel>

      <div className="mt-5">
        {isLoading ? (
          <AdminSkeletonRows rows={6} />
        ) : isError || categories.length === 0 ? (
          <AdminEmptyState icon={Tags} title={isError ? "Couldn't load categories" : "No categories yet"} />
        ) : (
          <AdminTable>
            <thead>
              <tr>
                <th className={thClass}>Name</th>
                <th className={thClass}>Order</th>
                <th className={thClass}>Accounts</th>
                <th className={thClass}>Status</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {categories.map((c) => (
                <tr key={c.id}>
                  <td className={tdClass}>
                    <input
                      defaultValue={c.name}
                      maxLength={60}
                      onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (next && next !== c.name) update.mutate({ id: c.id, patch: { name: next } });
                        else e.target.value = c.name;
                      }}
                      className="w-full max-w-56 rounded-md bg-transparent px-2 py-1 text-sm ring-1 ring-inset ring-transparent hover:ring-slate-200 focus:outline-none focus:ring-emerald-500"
                      aria-label={`Rename ${c.name}`}
                    />
                  </td>
                  <td className={tdClass}>
                    <input
                      type="number"
                      defaultValue={c.sortOrder}
                      min={0}
                      onBlur={(e) => {
                        const next = Number(e.target.value);
                        if (Number.isInteger(next) && next >= 0 && next !== c.sortOrder) {
                          update.mutate({ id: c.id, patch: { sortOrder: next } });
                        }
                      }}
                      className="w-20 rounded-md bg-transparent px-2 py-1 text-sm ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-emerald-500"
                      aria-label={`Sort order for ${c.name}`}
                    />
                  </td>
                  <td className={cn(tdClass, "tabular-nums")}>{c.accounts}</td>
                  <td className={tdClass}>
                    <button
                      type="button"
                      onClick={() => update.mutate({ id: c.id, patch: { isActive: !c.isActive } })}
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
                        c.isActive
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                          : "bg-slate-100 text-slate-500 ring-slate-400/20",
                      )}
                      title={c.isActive ? "Click to deactivate" : "Click to activate"}
                    >
                      {c.isActive ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className={cn(tdClass, "text-right")}>
                    <AdminButton
                      variant="ghost"
                      size="sm"
                      disabled={c.accounts > 0 || remove.isPending}
                      title={c.accounts > 0 ? "In use — deactivate instead" : "Delete"}
                      onClick={() => remove.mutate(c.id)}
                      aria-label={`Delete ${c.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </AdminButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        )}
      </div>
    </div>
  );
}
