import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Topbar } from "@/components/dashboard/Topbar";
import { OnboardingWrapper } from "@/components/onboarding/OnboardingWrapper";

/**
 * The plan badge lives in the sidebar but isn't on the JWT, so it's read here.
 * The database may not be reachable during local UI work, and a dead sidebar is
 * worse than a missing badge — fall back to null rather than crashing the shell.
 */
async function getPlanName(tenantId: string) {
  try {
    const sub = await prisma.subscription.findUnique({
      where: { tenantId },
      select: { plan: { select: { displayName: true, name: true } } },
    });
    return sub?.plan.displayName ?? sub?.plan.name ?? null;
  } catch {
    return null;
  }
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "SUPER_ADMIN") redirect("/dashboard");

  const plan = await getPlanName(session.user.tenantId);

  return (
    <div className="flex h-screen overflow-hidden bg-[#f6f7f9]">
      <Sidebar
        user={{
          name: session.user.name,
          role: session.user.role,
          avatar: session.user.avatar,
          tenantName: session.user.tenantName,
          plan,
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar tenantName={session.user.tenantName} />
        <main className="scrollbar-slim flex-1 overflow-auto p-4 lg:p-6">{children}</main>
      </div>

      <OnboardingWrapper tenantId={session.user.tenantId} tenantName={session.user.tenantName} />
    </div>
  );
}
