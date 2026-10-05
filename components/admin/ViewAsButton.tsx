"use client";

// "View as" — open a client or reseller account as its owner would (lib/viewAs.ts).

import { useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { AdminButton } from "@/components/admin/ui";

export function ViewAsButton({
  tenantId,
  size = "sm",
  variant = "secondary",
  className,
}: {
  tenantId: string;
  size?: "sm" | "md";
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/view-as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Couldn't open this account");
      // A full load, so the server renders the account with the new session.
      window.location.href = json.data.redirect;
    } catch (e) {
      setError((e as Error).message);
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <AdminButton size={size} variant={variant} className={className} disabled={pending} onClick={start}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
        View as
      </AdminButton>
      {error && <span className="max-w-60 text-right text-xs text-rose-600">{error}</span>}
    </span>
  );
}
