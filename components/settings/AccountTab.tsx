"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Loader2, Users } from "lucide-react";
import { Card } from "@/components/ui";

function useInviteCode() {
  return useQuery({
    queryKey: ["account-invite-code"],
    queryFn: async () => {
      const res = await fetch("/api/account/invite-code");
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to load invite code");
      return (json.data as { inviteCode: string }).inviteCode;
    },
    staleTime: Infinity,
  });
}

export function AccountTab() {
  const { data: session } = useSession();
  const { data: inviteCode, isLoading } = useInviteCode();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="space-y-5">
      {/* Profile info */}
      <Card className="p-5">
        <h2 className="font-semibold text-slate-900">Your account</h2>
        <p className="mt-0.5 text-sm text-slate-500">Information about the account you&apos;re signed in with.</p>

        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Name</dt>
            <dd className="mt-0.5 text-sm text-slate-900">{session?.user?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Email</dt>
            <dd className="mt-0.5 text-sm text-slate-900">{session?.user?.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Role</dt>
            <dd className="mt-0.5 text-sm text-slate-900">
              {session?.user?.role
                ? session.user.role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
                : "—"}
            </dd>
          </div>
        </dl>
      </Card>

      {/* Invite code */}
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <Users className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-900">Your invite code</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Share this code with anyone — when they sign up using it, the referral is recorded
              against your account.
            </p>
          </div>
        </div>

        <div className="mt-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 font-mono text-lg font-semibold tracking-[0.2em] text-slate-900">
                {inviteCode ?? "—"}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                disabled={!inviteCode}
                aria-label="Copy invite code"
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-600" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy
                  </>
                )}
              </button>
            </div>
          )}
          <p className="mt-2 text-xs text-slate-400">
            This code is unique to your account and never expires.
          </p>
        </div>
      </Card>
    </div>
  );
}
