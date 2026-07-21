"use client";

import dynamic from "next/dynamic";

const OnboardingWizard = dynamic(
  () => import("./OnboardingWizard").then((m) => m.OnboardingWizard),
  { ssr: false }
);

export function OnboardingWrapper({ tenantId, tenantName }: { tenantId: string; tenantName?: string | null }) {
  return <OnboardingWizard tenantId={tenantId} tenantName={tenantName} />;
}
