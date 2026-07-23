// Admin panel layout (SUPER_ADMIN only) — white theme, ink text.

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white text-slate-900">
      <AdminSidebar name={session.user.name} email={session.user.email} />

      <main className="scrollbar-slim flex-1 overflow-y-auto bg-[#FAFAFA]">
        <div className="mx-auto max-w-[1400px] px-4 pb-12 pt-16 sm:px-6 lg:px-8 lg:pt-8">
          {children}
        </div>
      </main>
    </div>
  );
}