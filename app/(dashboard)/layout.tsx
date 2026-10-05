import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Topbar } from "@/components/dashboard/Topbar";
import { ViewAsBanner } from "@/components/dashboard/ViewAsBanner";
import { OnboardingWrapper } from "@/components/onboarding/OnboardingWrapper";
import { brandStyle, getBrandForTenant } from "@/lib/branding";
import { BrandProvider } from "@/components/BrandProvider";

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
  // The Super Admin works in the admin panel, and comes in here only to view an
  // account (lib/viewAs.ts) — then the session already carries that account.
  const viewing = session.user.viewAs ? session.user.tenantName : null;
  if (session.user.role === "SUPER_ADMIN" && !viewing) redirect("/dashboard");

  const isReseller = session.user.accountType === "RESELLER";
  // A white-label reseller and its clients see the reseller's brand; its colour
  // re-points the app's emerald palette for everything below (lib/branding.ts).
  const [plan, brand] = await Promise.all([
    isReseller ? Promise.resolve(null) : getPlanName(session.user.tenantId),
    getBrandForTenant(session.user.tenantId),
  ]);

  return (
    <BrandProvider
      brand={{
        name: brand.name,
        logoUrl: brand.logoUrl,
        primaryColor: brand.primaryColor,
        supportEmail: brand.supportEmail,
        isWhiteLabel: brand.isWhiteLabel,
      }}
    >
    <div className="flex h-dvh overflow-hidden bg-[#f6f7f9]" style={brandStyle(brand)}>
      <Sidebar
        user={{
          name: session.user.name,
          role: session.user.role,
          avatar: session.user.avatar,
          tenantName: session.user.tenantName,
          plan,
          accountType: session.user.accountType,
          resellerType: session.user.resellerType,
        }}
        brand={{ name: brand.name, logoUrl: brand.logoUrl }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {viewing && <ViewAsBanner tenantName={viewing} reseller={isReseller} />}
        <Topbar tenantName={session.user.tenantName} reseller={isReseller} />
        <main className="scrollbar-slim flex-1 overflow-auto p-4 lg:p-6">{children}</main>
      </div>

      {/* WhatsApp onboarding is for client accounts; resellers never connect a number. */}
      {!isReseller && !viewing && <OnboardingWrapper tenantId={session.user.tenantId} tenantName={session.user.tenantName} />}
    </div>
    </BrandProvider>
  );
}
