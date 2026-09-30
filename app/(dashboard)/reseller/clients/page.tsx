"use client";

// Reseller → Clients: every client this reseller manages or referred, with plan,
// status and usage counts; and a form to create a new client account.

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Building2, Check, Copy, Loader2, Plus, Search } from "lucide-react";
import { Badge, Button, Card, EmptyState, Field, Modal, PageHeader, SkeletonRows, inputClass } from "@/components/ui";
import { api, money, rupees, STATUS_TONE } from "@/components/reseller/shared";
import { cn, formatDate } from "@/lib/utils";

interface ClientRow {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  managed: boolean;
  commissionMinor: number;
  category: { name: string } | null;
  subscription: { status: string; currentPeriodEnd: string; plan: { id: string; displayName: string } } | null;
  owner: { name: string; email: string; lastLoginAt: string | null } | null;
  counts: { users: number; contacts: number };
}

interface PlanOption { id: string; displayName: string; priceMonthly: number; isActive?: boolean }

function ClientsPageInner() {
  const qc = useQueryClient();
  const params = useSearchParams();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(params.get("new") === "1");

  const list = useQuery({
    queryKey: ["reseller", "clients", search.trim(), page],
    queryFn: () =>
      api<{ data: ClientRow[]; pagination: { total: number; totalPages: number; page: number } }>(
        `/api/reseller/clients?page=${page}&search=${encodeURIComponent(search.trim())}`,
      ),
    placeholderData: keepPreviousData,
  });

  const rows = list.data?.data ?? [];
  const pagination = list.data?.pagination;

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Businesses you manage or referred. You see their account and usage — never their chats or messages."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Add client
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className={cn(inputClass, "pl-8")}
              placeholder="Search clients"
              aria-label="Search clients"
            />
          </div>
        </div>

        {list.isLoading ? (
          <div className="p-4"><SkeletonRows rows={5} /></div>
        ) : list.isError ? (
          <EmptyState icon={AlertCircle} title="Couldn't load clients" description={(list.error as Error).message} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={search ? "No matching clients" : "No clients yet"}
            description="Add a client here, or share your referral link from the Overview page."
          />
        ) : (
          <div className="scrollbar-slim overflow-x-auto">
            <table className="w-full min-w-3xl text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  <th className="px-4 py-2.5 font-medium">Plan</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Users</th>
                  <th className="px-4 py-2.5 font-medium">Contacts</th>
                  <th className="px-4 py-2.5 font-medium">Commission</th>
                  <th className="px-4 py-2.5 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((c) => {
                  const status = !c.isActive ? "SUSPENDED" : c.subscription?.status ?? "—";
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <Link href={`/reseller/clients/${c.id}`} className="font-medium text-slate-900 hover:text-emerald-700">
                          {c.name}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {c.owner?.email ?? "—"}
                          {!c.managed && " · referred"}
                          {c.category && ` · ${c.category.name}`}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">{c.subscription?.plan.displayName ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <Badge className={STATUS_TONE[status] ?? ""}>{status}</Badge>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-700">{c.counts.users}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-700">{c.counts.contacts.toLocaleString()}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-700">{money(c.commissionMinor)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">{formatDate(c.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
            <span>{pagination.total} clients · page {pagination.page} of {pagination.totalPages}</span>
            <div className="flex gap-1">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button variant="secondary" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>

      <CreateClientModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: ["reseller"] })}
      />
    </div>
  );
}

function CreateClientModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", ownerName: "", ownerEmail: "", planId: "", trialDays: 14, categoryId: "" });
  const [created, setCreated] = useState<{ email: string; tempPassword: string; emailSent: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const plans = useQuery({
    queryKey: ["reseller", "plans"],
    queryFn: async () =>
      (await api<{ data: { plans: PlanOption[]; basePlans: PlanOption[] } }>("/api/reseller/plans")).data,
    enabled: open,
  });
  const categories = useQuery({
    queryKey: ["account-category"],
    queryFn: async () =>
      (await api<{ data: { categories: { id: string; name: string }[] } }>("/api/account/category")).data,
    enabled: open,
  });

  // The same rule the server applies: own active plans, else the platform's.
  const own = (plans.data?.plans ?? []).filter((p) => p.isActive);
  const options = own.length ? own : plans.data?.basePlans ?? [];

  const create = useMutation({
    mutationFn: () =>
      api<{ data: { owner: { email: string }; tempPassword: string; emailSent: boolean } }>("/api/reseller/clients", {
        method: "POST",
        json: {
          name: form.name,
          ownerName: form.ownerName || undefined,
          ownerEmail: form.ownerEmail,
          planId: form.planId,
          trialDays: form.trialDays,
          categoryId: form.categoryId || null,
        },
      }),
    onSuccess: (r) => {
      setCreated({ email: r.data.owner.email, tempPassword: r.data.tempPassword, emailSent: r.data.emailSent });
      onCreated();
    },
  });

  function close() {
    if (create.isPending) return;
    setForm({ name: "", ownerName: "", ownerEmail: "", planId: "", trialDays: 14, categoryId: "" });
    setCreated(null);
    create.reset();
    onClose();
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: k === "trialDays" ? Number(e.target.value) : e.target.value }));

  return (
    <Modal open={open} onClose={close} title={created ? "Client created" : "Add a client"}>
      {created ? (
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">
            {created.emailSent
              ? `Login details were emailed to ${created.email}.`
              : `The email to ${created.email} couldn't be sent — share these details yourself.`}
          </p>
          <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
            <p>Email: <span className="font-mono">{created.email}</span></p>
            <p className="mt-1">Temporary password: <span className="font-mono">{created.tempPassword}</span></p>
          </div>
          <p className="text-xs text-slate-500">This password is shown only once. The client should change it after logging in.</p>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(created.tempPassword);
                  setCopied(true);
                } catch { /* ignore */ }
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy password
            </Button>
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
        >
          <Field label="Business name" htmlFor="c-name" required>
            <input id="c-name" value={form.name} onChange={set("name")} className={inputClass} maxLength={120} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Owner name" htmlFor="c-owner">
              <input id="c-owner" value={form.ownerName} onChange={set("ownerName")} className={inputClass} maxLength={120} />
            </Field>
            <Field label="Owner email" htmlFor="c-email" required>
              <input id="c-email" type="email" value={form.ownerEmail} onChange={set("ownerEmail")} className={inputClass} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Plan" htmlFor="c-plan" required>
              <select id="c-plan" value={form.planId} onChange={set("planId")} className={inputClass}>
                <option value="">{plans.isLoading ? "Loading…" : "— Choose a plan —"}</option>
                {options.map((p) => (
                  <option key={p.id} value={p.id}>{p.displayName} · {rupees(p.priceMonthly)}/mo</option>
                ))}
              </select>
            </Field>
            <Field label="Free trial (days)" htmlFor="c-trial">
              <input id="c-trial" type="number" min={0} max={90} value={form.trialDays} onChange={set("trialDays")} className={inputClass} />
            </Field>
          </div>
          <Field label="Business category" htmlFor="c-cat">
            <select id="c-cat" value={form.categoryId} onChange={set("categoryId")} className={inputClass}>
              <option value="">—</option>
              {(categories.data?.categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          {create.isError && (
            <p className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {(create.error as Error).message}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={close}>Cancel</Button>
            <Button type="submit" disabled={!form.name.trim() || !form.ownerEmail.trim() || !form.planId || create.isPending}>
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Create client
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export default function ResellerClientsPage() {
  return (
    <Suspense>
      <ClientsPageInner />
    </Suspense>
  );
}
