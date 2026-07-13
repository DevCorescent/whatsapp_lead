// TODO [HEMANT]: Admin panel layout (SUPER_ADMIN only).
// Style: dark sidebar, platform branding "Corescent Admin".
// Sidebar links: Dashboard, Tenants, Plans, Revenue, Audit Logs, Settings.

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/login");
  }

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      {/* TODO [HEMANT]: AdminSidebar component */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-lg font-bold text-purple-400">Corescent Admin</h1>
          <p className="text-xs text-gray-500">Super Admin Panel</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {/* TODO [HEMANT]: AdminNav links */}
          <div className="text-sm text-gray-400 px-3 py-2 rounded hover:bg-gray-800 cursor-pointer">Dashboard</div>
          <div className="text-sm text-gray-400 px-3 py-2 rounded hover:bg-gray-800 cursor-pointer">Tenants</div>
          <div className="text-sm text-gray-400 px-3 py-2 rounded hover:bg-gray-800 cursor-pointer">Plans</div>
          <div className="text-sm text-gray-400 px-3 py-2 rounded hover:bg-gray-800 cursor-pointer">Revenue</div>
          <div className="text-sm text-gray-400 px-3 py-2 rounded hover:bg-gray-800 cursor-pointer">Audit Logs</div>
        </nav>
        <div className="p-4 border-t border-gray-800 text-xs text-gray-600">
          {session.user.email}
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
