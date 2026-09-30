"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { BlacklistManager } from "@/components/blacklist/BlacklistManager";

function BlacklistPageInner() {
  // Linked from a contact's page as /blacklist?search=<phone>.
  const search = useSearchParams().get("search") ?? "";
  return (
    <div>
      <PageHeader
        title="Blacklist"
        description="Numbers this account must never message. Applies to every business, campaign and reply."
      />
      <BlacklistManager scope="account" initialSearch={search.replace(/\D/g, "")} />
    </div>
  );
}

export default function BlacklistPage() {
  return (
    <Suspense>
      <BlacklistPageInner />
    </Suspense>
  );
}
