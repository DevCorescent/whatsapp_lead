"use client";

// Reseller overview: clients, commission, and the referral link to share.

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Copy, Link2, ShieldCheck } from "lucide-react";
import { Button, Card, PageHeader, SkeletonRows } from "@/components/ui";
import { api, money, Tile } from "@/components/reseller/shared";

interface Overview {
  account: { name: string; resellerType: "NORMAL" | "WHITE_LABEL"; commissionRate: number | null } | null;
  clients: { total: number; active: number; trialing: number };
  commission: { pendingMinor: number; paidMinor: number; thisMonthMinor: number };
  referral: { code: string; link: string };
  permissions: string[];
}

export default function ResellerOverviewPage() {
  const [copied, setCopied] = useState(false);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["reseller", "overview"],
    queryFn: async () => (await api<{ data: Overview }>("/api/reseller/overview")).data,
  });

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the link is visible to copy by hand */
    }
  }

  if (isLoading) return <SkeletonRows rows={6} />;
  if (isError || !data) {
    return <Card className="p-6 text-sm text-rose-700">{(error as Error)?.message ?? "Couldn't load the overview."}</Card>;
  }

  const wl = data.account?.resellerType === "WHITE_LABEL";

  return (
    <div className="space-y-5">
      <PageHeader
        title={data.account?.name ?? "Reseller"}
        description={wl ? "White-label reseller — your clients see your brand." : "Reseller — referral and commission partner."}
        action={
          data.permissions.includes("reseller.clients.manage") && (
            <Link href="/reseller/clients?new=1">
              <Button>Add client</Button>
            </Link>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Clients" value={data.clients.total} hint={`${data.clients.active} active`} />
        <Tile label="On trial" value={data.clients.trialing} tone="sky" />
        <Tile label="Commission this month" value={money(data.commission.thisMonthMinor)} tone="emerald" />
        <Tile
          label="Pending payout"
          value={money(data.commission.pendingMinor)}
          hint={`${money(data.commission.paidMinor)} paid to date`}
          tone="amber"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Link2 className="h-4 w-4 text-emerald-600" /> Your referral link
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Businesses that sign up with this link become your clients
            {data.account?.commissionRate ? ` and earn you ${data.account.commissionRate}% of what they pay` : ""}.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 ring-1 ring-inset ring-slate-200">
              {data.referral.link}
            </code>
            <Button variant="secondary" onClick={() => copy(data.referral.link)}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-400">Referral code: {data.referral.code}</p>
        </Card>

        <Card className="p-5 text-sm text-slate-600">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ShieldCheck className="h-4 w-4 text-emerald-600" /> What you can see
          </h2>
          <p className="mt-2 leading-relaxed">
            You manage your clients&apos; accounts, plans and usage, and see your commission. Their
            chats, contacts and messages stay private to them — you can&apos;t read them or send on
            their behalf.
          </p>
          <Link href="/reseller/clients" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-900">
            View clients <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Card>
      </div>
    </div>
  );
}
