"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * Triggers a CSV download from GET /api/export?resource=... . The request rides
 * the session cookie, so a plain anchor click authenticates the same way a page
 * navigation does — no token juggling. The brief pending state stops double
 * clicks from firing two downloads.
 */
export function ExportButton({
  resource,
  label = "Export CSV",
  variant = "secondary",
}: {
  resource: "contacts" | "leads" | "campaigns" | "analytics";
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const [busy, setBusy] = useState(false);

  const download = () => {
    setBusy(true);
    const a = document.createElement("a");
    a.href = `/api/export?resource=${resource}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // The browser takes over the download; re-enable shortly after.
    setTimeout(() => setBusy(false), 1200);
  };

  return (
    <Button variant={variant} onClick={download} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {label}
    </Button>
  );
}
