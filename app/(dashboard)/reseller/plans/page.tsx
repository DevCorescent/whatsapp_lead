"use client";

// Reseller → Plans: the reseller's own plans for its clients, each built on a
// platform plan (limits inherited, price never below the platform's).

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CreditCard, Loader2, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, EmptyState, Field, Modal, PageHeader, SkeletonRows, inputClass } from "@/components/ui";
import { api, rupees } from "@/components/reseller/shared";

interface ResellerPlan {
  id: string; displayName: string; description: string | null; priceMonthly: number; priceAnnual: number;
  isActive: boolean; basePlanId: string | null; maxContacts: number; maxMsgPerMonth: number; maxAgents: number; clients: number;
}
interface BasePlan { id: string; displayName: string; priceMonthly: number; priceAnnual: number; maxContacts: number; maxMsgPerMonth: number; maxAgents: number }

const lim = (n: number) => (n > 0 ? n.toLocaleString() : "Unlimited");

export default function ResellerPlansPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["reseller", "plans"],
    queryFn: async () => (await api<{ data: { plans: ResellerPlan[]; basePlans: BasePlan[] } }>("/api/reseller/plans")).data,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["reseller"] });

  const patch = useMutation({
    mutationFn: (v: { id: string; json: Record<string, unknown> }) => api(`/api/reseller/plans/${v.id}`, { method: "PATCH", json: v.json }),
    onSuccess: () => { setError(null); refresh(); },
    onError: (e: Error) => setError(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/reseller/plans/${id}`, { method: "DELETE" }),
    onSuccess: () => { setError(null); refresh(); },
    onError: (e: Error) => setError(e.message),
  });

  const plans = data?.plans ?? [];
  const baseName = (id: string | null) => data?.basePlans.find((b) => b.id === id)?.displayName ?? "—";

  return (
    <div>
      <PageHeader
        title="Plans"
        description="Your own plans for your clients. Each is based on a platform plan: same limits, your name and price."
        action={<Button className="h-10 sm:h-9" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New plan</Button>}
      />
      {error && (
        <p className="mb-4 flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}
      {isLoading ? (
        <SkeletonRows rows={4} />
      ) : isError ? (
        <Card><EmptyState icon={AlertCircle} title="Couldn't load plans" /></Card>
      ) : plans.length === 0 ? (
        <Card>
          <EmptyState
            icon={CreditCard}
            title="No plans of your own yet"
            description="Until you add one, your clients see and buy the platform's standard plans."
            action={<Button className="h-10 sm:h-9" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New plan</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
            <Card key={p.id} className="flex flex-col p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="break-words font-semibold text-slate-900">{p.displayName}</h2>
                  <p className="text-xs text-slate-500">Based on {baseName(p.basePlanId)}</p>
                </div>
                <Badge className={p.isActive ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : ""}>
                  {p.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              <p className="mt-3 text-2xl font-semibold text-slate-900">
                {rupees(p.priceMonthly)}<span className="text-sm font-normal text-slate-500">/mo</span>
              </p>
              <p className="text-xs text-slate-500">{rupees(p.priceAnnual)}/yr</p>
              {p.description && <p className="mt-2 text-sm text-slate-600">{p.description}</p>}
              <ul className="mt-3 space-y-1 text-xs text-slate-600">
                <li>{lim(p.maxContacts)} contacts</li>
                <li>{lim(p.maxMsgPerMonth)} messages / month</li>
                <li>{lim(p.maxAgents)} users</li>
              </ul>
              <p className="mt-3 text-xs text-slate-500">{p.clients} client{p.clients === 1 ? "" : "s"} on this plan</p>
              <div className="mt-auto flex gap-2 pt-4">
                <Button variant="secondary" size="sm" onClick={() => patch.mutate({ id: p.id, json: { isActive: !p.isActive } })}>
                  {p.isActive ? "Deactivate" : "Activate"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={p.clients > 0}
                  title={p.clients > 0 ? "Clients are on this plan — deactivate it instead" : "Delete"}
                  onClick={() => remove.mutate(p.id)}
                  aria-label={`Delete ${p.displayName}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <ResellerRatesCard />

      <NewPlanModal open={open} onClose={() => setOpen(false)} basePlans={data?.basePlans ?? []} onCreated={refresh} />
    </div>
  );
}

const RATE_LABEL: Record<string, string> = {
  WA_MARKETING: "WhatsApp — marketing",
  WA_UTILITY: "WhatsApp — utility",
  WA_AUTHENTICATION: "WhatsApp — authentication",
};

/** What the reseller's clients pay per message — never below the platform price. */
function ResellerRatesCard() {
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const { data } = useQuery({
    queryKey: ["reseller", "rates"],
    queryFn: async () =>
      (await api<{ data: { category: string; platformMinor: number | null; yoursMinor: number | null }[] }>("/api/reseller/rates")).data,
  });
  const save = useMutation({
    mutationFn: (v: { category: string; priceMinor: number | null }) => api("/api/reseller/rates", { method: "PUT", json: v }),
    onSuccess: (_d, v) => {
      setEdits((e) => { const n = { ...e }; delete n[v.category]; return n; });
      qc.invalidateQueries({ queryKey: ["reseller", "rates"] });
    },
  });
  if (!data) return null;

  return (
    <Card className="mt-6 p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-slate-900">Message prices for your clients</h2>
      <p className="mt-1 text-xs text-slate-500">
        In paise per message (₹0.25 = 25). Leave blank to use the platform price. You can charge more, never less.
      </p>
      <div className="mt-4 space-y-2">
        {data.map((r) => {
          const value = edits[r.category] ?? (r.yoursMinor === null ? "" : String(r.yoursMinor));
          return (
            <div key={r.category} className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center">
              <span className="text-slate-700 sm:w-64">{RATE_LABEL[r.category] ?? r.category}</span>
              <span className="text-xs text-slate-500 sm:w-40">
                Platform: {r.platformMinor === null ? "not priced" : `${r.platformMinor} paise`}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min={r.platformMinor ?? 0}
                  disabled={r.platformMinor === null}
                  value={value}
                  placeholder="Platform price"
                  onChange={(e) => setEdits((x) => ({ ...x, [r.category]: e.target.value }))}
                  className={`${inputClass} w-36`}
                  aria-label={`Your price for ${RATE_LABEL[r.category]}`}
                />
                {r.category in edits && (
                  <Button
                    size="sm"
                    disabled={save.isPending}
                    onClick={() => save.mutate({ category: r.category, priceMinor: value === "" ? null : Math.round(Number(value)) })}
                  >
                    Save
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {save.isError && <p className="mt-2 text-xs text-rose-700">{(save.error as Error).message}</p>}
    </Card>
  );
}

function NewPlanModal({ open, onClose, basePlans, onCreated }: { open: boolean; onClose: () => void; basePlans: BasePlan[]; onCreated: () => void }) {
  const [form, setForm] = useState({ displayName: "", description: "", basePlanId: "", priceMonthly: "", priceAnnual: "" });
  const base = basePlans.find((b) => b.id === form.basePlanId);

  const create = useMutation({
    mutationFn: () =>
      api("/api/reseller/plans", {
        method: "POST",
        json: {
          displayName: form.displayName,
          description: form.description || undefined,
          basePlanId: form.basePlanId,
          priceMonthly: Number(form.priceMonthly),
          ...(form.priceAnnual && { priceAnnual: Number(form.priceAnnual) }),
        },
      }),
    onSuccess: () => { onCreated(); close(); },
  });

  function close() {
    setForm({ displayName: "", description: "", basePlanId: "", priceMonthly: "", priceAnnual: "" });
    create.reset();
    onClose();
  }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Modal open={open} onClose={close} title="New plan">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <Field label="Based on" htmlFor="p-base" required>
          <select id="p-base" value={form.basePlanId} onChange={set("basePlanId")} className={inputClass}>
            <option value="">— Choose a platform plan —</option>
            {basePlans.map((b) => <option key={b.id} value={b.id}>{b.displayName} · from {rupees(b.priceMonthly)}/mo</option>)}
          </select>
        </Field>
        {base && (
          <p className="-mt-2 text-xs text-slate-500">
            {lim(base.maxContacts)} contacts · {lim(base.maxMsgPerMonth)} messages/month · {lim(base.maxAgents)} users.
            Minimum price {rupees(base.priceMonthly)}/mo, {rupees(base.priceAnnual)}/yr.
          </p>
        )}
        <Field label="Plan name" htmlFor="p-name" required>
          <input id="p-name" value={form.displayName} onChange={set("displayName")} className={inputClass} maxLength={60} placeholder="e.g. School Pro" />
        </Field>
        <Field label="Description" htmlFor="p-desc">
          <input id="p-desc" value={form.description} onChange={set("description")} className={inputClass} maxLength={300} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Price per month (₹)" htmlFor="p-m" required>
            <input id="p-m" type="number" min={base?.priceMonthly ?? 0} step="1" value={form.priceMonthly} onChange={set("priceMonthly")} className={inputClass} />
          </Field>
          <Field label="Price per year (₹)" htmlFor="p-y">
            <input id="p-y" type="number" min={base?.priceAnnual ?? 0} step="1" value={form.priceAnnual} onChange={set("priceAnnual")} className={inputClass} placeholder="12 × monthly" />
          </Field>
        </div>
        {create.isError && (
          <p className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {(create.error as Error).message}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" className="h-10 sm:h-9" onClick={close}>Cancel</Button>
          <Button type="submit" className="h-10 sm:h-9" disabled={!form.basePlanId || !form.displayName.trim() || !form.priceMonthly || create.isPending}>
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Create plan
          </Button>
        </div>
      </form>
    </Modal>
  );
}
