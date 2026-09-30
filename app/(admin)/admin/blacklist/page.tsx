"use client";

import { AdminPageHeader } from "@/components/admin/ui";
import { BlacklistManager } from "@/components/blacklist/BlacklistManager";

export default function AdminBlacklistPage() {
  return (
    <div>
      <AdminPageHeader
        title="Platform blacklist"
        description="Numbers no account on the platform can message. Accounts also keep their own blacklists."
      />
      <BlacklistManager scope="platform" />
    </div>
  );
}
