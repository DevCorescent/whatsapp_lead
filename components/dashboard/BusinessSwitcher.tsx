"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronsUpDown, Check, Plus, Settings2, Loader2 } from "lucide-react";
import { Modal, Field, Button, inputClass } from "@/components/ui";
import {
  useBusinesses,
  useSwitchBusiness,
  useCreateBusiness,
  type BusinessesResponse,
} from "@/hooks/useBusinesses";

/**
 * The business (workspace) switcher that replaces the static workspace label.
 *
 * Shows the current business and, on click, every business the tenant owns. Picking
 * one POSTs to /api/businesses/switch (which sets the cookie) and then invalidates
 * the whole React Query cache + refreshes the server components, so the entire CRM
 * re-renders under the new business without a logout. A quick "Create business"
 * action is included; full management lives on /businesses.
 */
export function BusinessSwitcher({
  initialData,
}: {
  initialData?: BusinessesResponse;
}) {
  const router = useRouter();
  const { data } = useBusinesses(initialData);
  const switchBusiness = useSwitchBusiness();
  const createBusiness = useCreateBusiness();

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const businesses = data?.data ?? [];
  const currentId = data?.currentBusinessId;
  const current = businesses.find((b) => b.id === currentId) ?? businesses[0];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const onSwitch = (id: string) => {
    if (id === currentId) {
      setOpen(false);
      return;
    }
    switchBusiness.mutate(id, { onSuccess: () => setOpen(false) });
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await createBusiness.mutateAsync({ name: name.trim() });
      const created = res?.data;
      setCreating(false);
      setName("");
      // Land the user inside their new business right away.
      if (created?.id) switchBusiness.mutate(created.id);
      else router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create business");
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg bg-slate-50 px-2.5 py-2 text-left ring-1 ring-inset ring-slate-200/70 transition hover:bg-slate-100"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-600/10 text-emerald-700">
          <Building2 className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900">
            {current?.name ?? "Business"}
          </span>
          <span className="block truncate text-[11px] text-slate-400">
            {businesses.length} {businesses.length === 1 ? "business" : "businesses"}
          </span>
        </span>
        {switchBusiness.isPending ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" />
        ) : (
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-40 mb-1.5 w-full min-w-[15rem] overflow-hidden rounded-xl bg-white py-1 shadow-lg ring-1 ring-slate-900/5"
        >
          <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Businesses
          </p>
          <div className="max-h-64 overflow-y-auto">
            {businesses.map((b) => (
              <button
                key={b.id}
                role="menuitem"
                onClick={() => onSwitch(b.id)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-slate-50"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                  <Building2 className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-800">{b.name}</span>
                  {b.whatsappPhoneNumber && (
                    <span className="block truncate text-[11px] text-slate-400">
                      {b.whatsappPhoneNumber}
                    </span>
                  )}
                </span>
                {b.id === currentId && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
              </button>
            ))}
          </div>

          <div className="my-1 border-t border-slate-100" />
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setCreating(true);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
              <Plus className="h-3.5 w-3.5" />
            </span>
            Create business
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              router.push("/businesses");
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
              <Settings2 className="h-3.5 w-3.5" />
            </span>
            Manage businesses
          </button>
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Create business"
        description="A new WhatsApp business account with its own contacts, chats, campaigns, knowledge base and AI settings."
      >
        <form onSubmit={onCreate} className="space-y-4">
          <Field label="Business name" htmlFor="biz-name" required error={error ?? undefined}>
            <input
              id="biz-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Renzo Sales"
              className={inputClass}
              autoFocus
            />
          </Field>
          <p className="text-xs text-slate-500">
            You can connect its WhatsApp number and configure AI after creating it, from{" "}
            <span className="font-medium text-slate-600">Manage businesses</span>.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createBusiness.isPending || name.trim().length < 2}>
              {createBusiness.isPending ? "Creating…" : "Create business"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
